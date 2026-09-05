# Sections — Design Spec

**Date:** 2026-09-05
**Status:** Approved for planning

## Summary

Third piece of "core task depth" (after subtasks and projects). A project's tasks can be subdivided into named sections, rendered as a Trello-style board of columns — tasks become draggable cards you move between columns. A project with zero sections is unaffected: it keeps rendering the existing due-date-grouped list from the Projects cycle. Adding a project's first section is what switches that project's page into board view, so this is purely additive and opt-in per project, the same way Subtasks and Projects themselves didn't change any pre-existing task's rendering unless used.

## Goals

- A project's tasks can be organized into named sections (columns), rendered as a Kanban-style board.
- Dragging a task card onto a different column reassigns its section; a `SectionPicker` inside the task's detail view does the same without dragging.
- A project with no sections keeps rendering as the existing due-date-grouped list — creating that project's first section is what switches it into board view.
- Creating a task from a column's own quick-add input files it into that section automatically.
- Deleting a section with tasks in it always asks what to do with them — never silently unfiles or destroys.

## Non-Goals

- **No manual reordering.** Cards don't get a draggable position within a column, and columns don't get a draggable position relative to each other — column order is `created_at`, card order within a column is the existing due-date-ascending sort every other task list in this app already uses. There's no "position" concept anywhere in this schema today; introducing one (fractional indexing or integer reindexing, for two different entities) is real backend complexity with no clear ask beyond "some ordering." Full drag-to-reorder can be a later cycle if it turns out to matter.
- **No board view on the global Tasks page.** Boards only exist at `/projects/[projectId]`. Matches Projects' own "no project filter on the global Tasks page" non-goal — the dedicated project page is the one place per-project structure shows up.
- **No section on subtasks.** Consistent with Subtasks' own non-goals (title + completion only, no other task feature applies to them) — a subtask's `section_id` stays unused, same posture as its already-unused `project_id`.
- **No quick-add marker syntax for section assignment.** Picker-only or drag, matching Projects' "no marker syntax for project assignment" precedent — quick-add doesn't grow a second special character.
- **No WIP limits, swimlanes, board-level filtering, or per-column sort options.** A plain Trello-style board — columns, cards, drag between them. Nothing beyond what's needed to subdivide a project's tasks.
- **No section that isn't part of a project.** Every section belongs to exactly one project; there's no "unfiled section" the way there's an unfiled/no-project task. The "No Section" column is not a real row — it's the board's rendering of `section_id is null` within that project, exactly parallel to how "no project" isn't a real project row either.

## Data Model

```sql
create table sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table sections enable row level security;

create policy "sections_owner_all" on sections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index sections_user_project_idx on sections (user_id, project_id);

alter table tasks add column section_id uuid references sections(id) on delete set null;
create index tasks_user_section_idx on tasks (user_id, section_id);
```

`sections.project_id` is `not null` with `on delete cascade`: a section is meaningless without its project, so deleting a project always takes its sections with it regardless of which choice the user makes in `ProjectDeleteDialog` about the project's *tasks*. That cascade then triggers the existing `on delete set null` on `tasks.section_id` for any task that pointed at one of those now-deleted sections — a task that survives a project deletion (the "keep tasks, unfiled" branch) loses both `project_id` and `section_id` for free, no extra application code needed, the same "schema-level safety net" reasoning the Projects spec used for its own delete behavior.

## Rendering: List vs Board

`app/(app)/projects/[projectId]/page.tsx` fetches the project's `sections` alongside its existing queries. `sections.length === 0` renders exactly what it renders today (unchanged due-date-grouped list, `QuickAddBar`, `TaskRow`s). Otherwise it renders a new `<ProjectBoard>` in place of that body — same header, same `ProjectDeleteDialog`, same `ProjectHeader`, just a different task-rendering region underneath.

## Board Layout & Drag-and-Drop

**`components/projects/ProjectBoard.tsx`** (new): owns a `DndContext` (mirroring `MonthView`'s usage) wrapping a horizontally-scrolling row of `SectionColumn`s — a "No Section" column first (`section_id is null`), then one column per `sections` row in `created_at` order, then a trailing inline "+ Add section" input (a plain text field revealed on click, not a dialog — matches the Trello "add a list" convention more directly than `CreateProjectDialog`'s modal, since a column is already part of the row being built). The row uses `overflow-x-auto` with scroll-snap; this is also the entire mobile story — narrow viewports naturally show one column at a time and scroll horizontally, no separate mobile layout needed.

**`components/projects/SectionColumn.tsx`** (new): a `useDroppable({ id: section?.id ?? "unsectioned" })` column (mirroring `DayCell`'s droppable pattern) with an inline-rename-on-click header (matching `ProjectHeader`'s pattern; the "No Section" column has no header interaction, since it isn't a real row), a `SectionDeleteDialog` trigger (real sections only), a list of `TaskCard`s sorted by due date ascending, and a small "+ Add task" input at the bottom. A column shows every active task assigned to it, full stop — board mode doesn't use `groupTasksByDueDate` at all, so there's no "later" cutoff or "X more tasks further out" truncation the way the list view has; a Kanban column is expected to just be as tall as it needs to be.

**`lib/sections/useSectionDragAndDrop.ts`** (new, modeled directly on `lib/calendar/useEventDragAndDrop.ts`): `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))` — the same 8px activation threshold that already lets `EventChip` hold a checkbox and buttons without every click being mistaken for a drag. `handleDragEnd` reads the dragged task from `active.data.current.task` and calls `assignTaskSection(taskId, overId === "unsectioned" ? null : overId)`.

Completed tasks are removed from their column entirely (not shown crossed-out in place) and land in the same collapsed "Completed" accordion the project page already renders below its task list — unchanged component, just now positioned below the board instead of below the list. Archived tasks work the same way, unchanged.

## Task Cards & Detail

**`components/tasks/TaskCard.tsx`** (new): a compact draggable card — checkbox, title, due-date pill (same overdue/today styling `TaskRow` already computes), priority dot, subtask progress count. Modeled on `EventChip`: the draggable node is this compact summary (`useDraggable`), and clicking it (not the checkbox) opens a `TaskDetailDialog` rather than expanding inline — a column is too narrow (~280px) to hold what `TaskRow` shows today (`TagPicker`, `LinkedNotesPicker`, `SubtaskChecklist`, `ProjectPicker` all always-visible under the title), so the board needs the same "compact trigger, rich content elsewhere" split `EventChip` already uses for calendar chips, just with a `Dialog` instead of a `Popover` given how much content a task can carry.

**`components/tasks/TaskDetailDialog.tsx`** (new): the modal opened by clicking a card — title (click-to-edit, adapting `TaskEditForm`), `TagPicker`, `LinkedNotesPicker`, `SubtaskChecklist`, a new `SectionPicker`, and the existing delete/archive actions. Functionally this is `TaskRow`'s current always-visible content, repackaged into a dialog body instead of an always-expanded list row — the same components, a different container. It deliberately omits `ProjectPicker`: a card's project is already fixed by which board it's on, and moving a task to a *different* project remains a global-Tasks-page action (unchanged) rather than something duplicated into every card's dialog.

**`components/tasks/SectionPicker.tsx`** (new): single-select popover modeled on `ProjectPicker`, scoped to the current project's `sections` plus a "No section" option to clear it — the non-drag way to move a card, needed for anyone who'd rather not drag (or can't, in a given input mode).

## Task Creation

Each column's own small quick-add input creates a task with both `projectId` (the page's project, as today) and the new `sectionId` set to that column's section (or `null` for "No Section"). The project page's top-level `QuickAddBar` is not shown once a board is active — a board's per-column inputs are the only "add a task" entry points once one exists, avoiding two entry points that file tasks differently. `insertTaskCore`'s params (`lib/actions/tasks.ts`) gain an optional `sectionId?: string | null`, threaded the same way `projectId` already is.

## Section Management

**`lib/actions/sections.ts`** (new), following the established core/action split:
- `createSectionCore(supabase, userId, projectId, name)` / `createSection(projectId, name)`.
- `renameSectionCore(supabase, userId, sectionId, name)` / `renameSection(sectionId, name)` — plain update, no optimistic-concurrency check (same reasoning as project rename: a single low-contention field).
- `deleteSectionCore(supabase, userId, sectionId, deleteTasks: boolean)` / `deleteSection(sectionId, deleteTasks)` — `deleteTasks: false` deletes only the `sections` row (the schema's `on delete set null` unfiles every task that pointed at it, back into "No Section"); `deleteTasks: true` deletes every task with that `section_id` first, then the section row.
- `assignTaskSectionCore(supabase, userId, taskId, sectionId: string | null)` / `assignTaskSection(taskId, sectionId)` — plain update, used by both the drag handler and `SectionPicker`.

**`components/projects/SectionDeleteDialog.tsx`** (new): structurally identical to `ProjectDeleteDialog` — no tasks in the section → plain `ConfirmDeleteButton`; has tasks → a dialog offering "Keep tasks, move to No Section" (outline) and "Delete tasks too" (destructive).

## Cross-Cutting: Project Reassignment Clears Section

`assignTaskProjectCore` (`lib/actions/projects.ts`) is extended so that whenever it actually changes a task's `project_id` (to a different project, or to `null`), it sets `section_id: null` in the same update. A section belongs to exactly one project, so a task moved to a different project (via `ProjectPicker`, from either a project's board or the global Tasks page) can never keep pointing at a section from the project it just left. Reassigning to the project it's already in stays the existing no-op — nothing to clear.

## Error Handling & Edge Cases

- **Dragging a card onto the column it's already in**: a no-op update, same posture as `assignTaskProjectCore`'s existing "already in this project" no-op.
- **Creating a section with a blank name**: rejected client-side (`required`) and server-side (`z.string().trim().min(1)`), matching every other name field in this app.
- **A task's section is deleted while its `TaskDetailDialog` is open elsewhere**: the task simply reflects `section_id: null` on next load, same posture as any other concurrently-edited field today (no new conflict-handling needed).
- **Deleting a project that has sections**: sections are cascade-deleted regardless of which choice is made in `ProjectDeleteDialog` about the project's tasks. If tasks are kept (unfiled from the project), they lose `section_id` too, as a direct consequence of their section rows no longer existing — not a separately-coded case.
- **A task with no project is dragged onto a board column**: can't happen — boards only render a single project's tasks, and every card on a board already has that board's `project_id` by construction (it's how the card got queried onto the page).

## Testing Approach

- **Unit tests**: none new beyond what already exists, same reasoning as the Projects spec — no non-obvious parsing/pure-function logic here to isolate.
- **Integration tests** (`tests/integration/sections.test.ts`, new, built on the established `*Core`-direct-call template): creating a section; assigning and reassigning a task's `section_id`; deleting a section with `deleteTasks: false` confirms its tasks survive with `section_id: null`; deleting with `deleteTasks: true` confirms its tasks are gone; deleting a project with sections confirms the sections are gone and any kept tasks have both `project_id` and `section_id` null; `assignTaskProjectCore` confirms it clears `section_id` when a task's project actually changes, and leaves it alone on a no-op reassignment; a second user confirming RLS isolation on `sections`.
- **Manual verification**: create a couple of sections on a project and confirm it switches from list to board view; drag a card between columns and confirm it persists after reload; add a task via a column's own quick-add and confirm it's filed into that section; open a card's detail dialog and reassign its section via `SectionPicker` instead of dragging; delete a section both ways; delete a project that has sections and confirm the cascade; reassign a task's project from the global Tasks page and confirm a previously-set section clears; check the board's horizontal scroll on a narrow viewport.
- Full existing suite must stay green.
