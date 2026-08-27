# Calendar Task Chip: Edit & Delete — Design Spec

**Date:** 2026-08-26
**Status:** Approved for planning

## Summary

A task due beyond "This Month" on the Tasks page (see the due-date-grouping change earlier the same day) is now only reachable via a calendar chip that's a bare link back to `/tasks` — where it still won't appear, since that's the page it was hidden from. This closes that gap: calendar task chips get the same complete/edit/delete affordances the Tasks page already has, reusing its existing form and server actions rather than building parallel ones.

## Goals

- Every task, regardless of due date, has a real edit and delete path from wherever it's visible.
- No duplicated task-editing logic — the calendar's edit form and the Tasks page's edit form are the same component, calling the same `updateTask` action.
- Visually and behaviorally consistent with `EventChip`, the pattern this already follows on the calendar.

## Non-Goals

- Tags/notes pickers in the calendar's task popover — stays compact; `TaskRow` keeps those for the full Tasks-page experience.
- Dragging a task chip to reschedule — the edit form's due-date field already covers this.
- Any change to *linked* tasks (a task attached to a calendar event, shown via that event's own chip) — `EventChip`'s existing complete-only checkbox for those is untouched. This only applies to the plain "tasks due" list a day cell renders.

## Design

**`components/tasks/TaskEditForm.tsx`** (new) — the inline edit form currently built into `TaskRow.tsx`'s `editing` branch (title, priority, due-date fields; Save/Cancel; the optimistic-concurrency conflict banner), extracted as its own component taking `task` and `onSaved`/`onCancel` callbacks. `TaskRow.tsx` is refactored to render it instead of its inline JSX — no behavior change on the Tasks page, verified by the existing e2e flow still passing.

**`components/calendar/TaskChip.tsx`** (new) — mirrors `EventChip.tsx`'s shape: a `Popover`-triggered button styled like the current bare chip. Popover content:
- Title, priority dot (if set), relative due date + formatted time (same display bits `TaskRow` already uses).
- A "Mark complete" checkbox wired to `toggleTaskComplete`, matching `EventChip`'s existing linked-task checkbox.
- An "Edit" toggle that swaps the popover's content to `TaskEditForm`.
- `ConfirmDeleteButton` wired to `deleteTask`.

**`components/calendar/DayCell.tsx`** — the per-task `<Link href="/tasks">{title}</Link>` line is replaced with `<TaskChip task={task} />`.

**`components/calendar/MonthView.tsx` / `WeekView.tsx`** — their local `TaskSummary` type (`{id, title, due_at}`) widens to include `priority, completed_at, updated_at`, passed straight through from the page query (structurally compatible with `groupTasksByDay`, no change needed there).

**`app/(app)/calendar/page.tsx`** — the tasks query's `.select("id, title, due_at")` widens to `.select("id, title, due_at, priority, completed_at, updated_at")`. Existing filters (`due_at not null`, `completed_at is null`, within the visible range) are unchanged.

**`lib/actions/tasks.ts`** — `updateTask`, `deleteTask`, and `toggleTaskComplete` each gain `revalidatePath("/calendar")` alongside their existing `revalidatePath("/tasks")`, since all three are now reachable from the calendar page too — matches the multi-path convention `saveNote` already uses for actions reachable from more than one page.

## Testing Approach

- No new pure logic to unit test — this is UI wiring and server-action revalidation paths.
- Manual verification in the browser: open a far-future task's chip on the calendar, confirm complete/edit/delete each work and the chip updates accordingly; confirm a normal Tasks-page task's edit/delete still work unchanged after the `TaskRow` refactor; confirm a linked task's calendar chip (via its event) is unaffected.
- Full existing suite (`tsc`, lint, unit, integration, `next build`, Playwright e2e) must stay green — this is a refactor + new UI surface on top of code those already exercise.
