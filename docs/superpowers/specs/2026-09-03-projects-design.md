# Projects — Design Spec

**Date:** 2026-09-03
**Status:** Approved for planning

## Summary

Second piece of "core task depth" (after subtasks). A flat, top-level organizational layer above tasks — a user can create named projects and file tasks into one, with a dedicated project page reusing the Tasks page's existing due-date-grouped rendering. Sections (subdividing a project's tasks into named groups) is deliberately out of scope here, the same way subtasks were split off from this bundle originally — its own design cycle once Projects is proven.

## Goals

- A user can create, rename, and delete projects.
- A task can optionally belong to one project (exclusive, like a note's folder — not a tag).
- "Projects" is a fourth primary nav item; picking one shows a dedicated page for just that project's tasks, reusing the exact same due-date-grouped rendering the global Tasks page already has.
- Creating a task from within a project's own page automatically files it into that project.
- Deleting a project with tasks in it always asks what to do with them — never silently unfiles or destroys.

## Non-Goals

- **No Sections.** A project's tasks render as one flat due-date-grouped list, identical in shape to the global Tasks page. Subdividing that further is a separate, later design.
- **No project nesting.** Every project is flat, unlike Notes' arbitrarily-deep folder tree — nothing on the roadmap asked for sub-projects, and flat is the simpler structure that "projects/sections" (a two-level Project → Task shape, with Section as the one already-planned subdivision) actually implies.
- **No quick-add marker syntax for project assignment.** Unlike subtasks' `^Parent Title`, assigning a task to a project is picker-only for v1 (from the task row, or automatically when created from within the project's own page).
- **No project filter on the global Tasks page.** The dedicated `/projects/[projectId]` page is the one way to browse by project — mirroring how folder-browsing already works through the Notes tree, not a duplicate filter bolted onto an unrelated page.
- **No project color/icon customization.** A deterministic accent color keyed off the project's id (matching `lib/notes/notebookAccent.ts`'s existing approach for notebooks) — no stored color column "nobody asked for."
- **No project description or other metadata.** A project is a name and its tasks, full stop — matching folders' own minimal creation flow.
- **No project assignment on subtasks.** Consistent with the subtasks spec's own Non-Goals (title + completion only, no other task feature applies to them) — a subtask's `project_id` stays unused; it's implicitly "in" whatever project its parent is in, if any, with no independent picker or badge of its own.

## Data Model

```sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table projects enable row level security;

create policy "projects_owner_all" on projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table tasks add column project_id uuid references projects(id) on delete set null;
create index tasks_user_project_idx on tasks (user_id, project_id);
```
`on delete set null` is the schema-level safety net matching the spec's Delete Behavior section below (the default outcome — tasks survive unfiled — falls out of the schema itself; the "delete tasks too" branch is an explicit, separate application-level step). A task's project membership is completely independent of its tags (many-to-many via `taggables`) and its subtasks (`parent_task_id`) — three orthogonal ways to organize a task that never interact with each other.

## Navigation

`components/layout/TopNav.tsx` and `BottomNav`'s `NAV_ITEMS` gain a fourth entry, `{ href: "/projects", label: "Projects", icon: FolderKanban }` (or a similarly-fitting `lucide-react` icon), positioned between Tasks and Notes to match the roadmap's own ordering.

## Pages

**`app/(app)/projects/page.tsx`** (new, list): every one of the user's projects as a card — name, a count of its active tasks, and the deterministic accent color. A "+ New Project" button opens a small dialog with just a name field (`components/projects/CreateProjectDialog.tsx`, modeled on the minimal folder-creation flow) and redirects to the new project's page on success.

**`app/(app)/projects/[projectId]/page.tsx`** (new, detail): structurally a near-duplicate of `app/(app)/tasks/page.tsx` — same `groupTasksByDueDate` call, same `TaskRow` rendering, same Completed/Archived accordions — with every task query scoped by `.eq("project_id", projectId)` instead of running unfiltered. This reuse (not a new UI, the existing Tasks page's rendering logic pointed at a filtered query) is what keeps Projects tractable as one cycle without Sections. Its header shows the project's name, a rename affordance, and `ProjectDeleteDialog` (see below). Its own `QuickAddBar` is a small variant that passes this page's `projectId` through to task creation, so anything added here is automatically filed into the project.

`insertTaskCore`'s params (`lib/actions/tasks.ts`) gain an optional `projectId?: string | null`, threaded through from both the global quick-add (always `null`) and the project-page quick-add (always that page's id) — the same shape `alsoCreateTask`/`tagNames` already have as optional insert-time parameters.

## Task Assignment

**`components/tasks/ProjectPicker.tsx`** (new): modeled on `TagPicker`'s popover-with-search shape (`components/tags/TagPicker.tsx`) but single-select — choosing a project *replaces* the task's current one rather than adding to a set, and the list includes a "No project" option at the top to clear it. Rendered as a new sibling in `TaskRow`'s existing always-visible slot, alongside `TagPicker`/`LinkedNotesPicker`/`SubtaskChecklist`. When a task has a project, `TaskRow` also shows a small badge with the project's name and accent color next to the title — same visual weight and placement as the subtask "2/3" progress count.

`lib/actions/projects.ts` (new) gains `assignTaskProjectCore(supabase, userId, taskId, projectId)` (a plain `update` setting `project_id`, `projectId` may be `null` to clear it) and its `"use server"` wrapper `assignTaskProject`.

## Delete Behavior

**`components/projects/ProjectDeleteDialog.tsx`** (new): a structural copy of `EventDeleteDialog`'s pattern (`components/calendar/EventDeleteDialog.tsx`). If the project has no tasks, a plain `ConfirmDeleteButton`. If it has tasks, a dialog offering "Keep tasks, unfiled" and "Delete tasks too" (destructive), both calling `deleteProjectCore(supabase, userId, projectId, deleteTasks)`:
- `deleteTasks: false` (default/keep) — relies entirely on the schema's `on delete set null`: delete the `projects` row, every task that pointed at it now has `project_id = null` automatically, no separate update needed.
- `deleteTasks: true` — explicitly deletes every task with that `project_id` first, then deletes the project row.

## Error Handling & Edge Cases

- **Renaming a project**: a plain inline edit on the detail page's header (same `updateTask`-style optimistic-concurrency pattern is overkill for a single `name` field on a low-contention row — a direct update, no conflict detection needed).
- **Assigning a task to a project it's already in**: a no-op update, not an error — same posture as `linkTaskNoteCore`'s existing "linking an already-linked pair" no-op.
- **A task's project is deleted while the task's edit UI is open elsewhere**: the task simply reflects `project_id: null` on next load, same as any other concurrently-edited field in this app today (no new conflict-handling needed beyond what already doesn't exist for e.g. tags).
- **Creating a project with a blank name**: rejected client-side (`required` on the input) and server-side (`z.string().trim().min(1)`), matching every other title/name field in this app.

## Testing Approach

- **Unit tests**: none new beyond what already exists — `ProjectPicker`'s single-select logic and the deterministic accent color are simple enough to cover via the integration/manual passes below rather than needing isolated pure-function tests (unlike, say, `extractSubtaskParent`'s regex, there's no non-obvious parsing logic here to unit-test).
- **Integration tests** (`tests/integration/projects.test.ts`, new, built on the established `*Core`-direct-call template): creating a project; assigning and reassigning a task's `project_id`; deleting a project with `deleteTasks: false` confirms its tasks survive with `project_id: null`; deleting with `deleteTasks: true` confirms its tasks are gone; a second user confirming RLS isolation (can't see or assign into another user's project).
- **Manual verification**: create a project from `/projects`, add a task to it from the project page's own quick-add bar and confirm it's filed in automatically, reassign an existing task's project via `ProjectPicker` from the global Tasks page, delete a project both ways and confirm the resulting task state each time.
- Full existing suite must stay green.
