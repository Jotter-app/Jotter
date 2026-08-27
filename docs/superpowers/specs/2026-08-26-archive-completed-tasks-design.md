# Archive Completed Tasks — Design Spec

**Date:** 2026-08-26
**Status:** Approved for planning

## Summary

Lets the Tasks page's Completed section be cleared without permanently losing data. A new `archived_at` column (mirroring `completed_at`'s nullable-timestamp-as-flag shape) marks a completed task as archived; archived tasks disappear from the Completed list into their own collapsed-by-default Archived section, reachable both in bulk ("Archive completed" clears the whole Completed list at once) and per-task.

## Goals

- The Completed section stops growing without bound as a place to actually delete things from.
- Archiving is reversible — nothing is lost, unlike Delete.
- Matches this codebase's existing `completed_at` pattern exactly, so the mental model ("a nullable timestamp means done/not-done") stays consistent.

## Non-Goals

- Automatic/scheduled archiving (e.g. "archive anything completed 30+ days ago") — manual only, for now.
- Editing an archived task (tags, linked notes, title/priority/due-date) — archived rows are check/unarchive/delete only, not full `TaskRow`.
- Any change to how *active* tasks are grouped (`groupTasksByDueDate`) — archived tasks are always completed, so they never enter that logic.

## Design

**Schema** — new migration (`supabase/migrations/<timestamp>_add_tasks_archived_at.sql`), following the same additive-column pattern as `20260823172854_add_tasks_updated_at.sql`:
```sql
alter table tasks add column archived_at timestamptz;
```
No new index (personal-scale data, matching this table's existing restraint), no CHECK constraint (the invariant "archived implies completed" is enforced app-side, matching how `completed_at` itself has no DB-level constraints today).

**`lib/actions/tasks.ts`**:
- `archiveTask(taskId)` and `unarchiveTask(taskId)` — new, matching `deleteTask`'s minimal shape (guard → mutate → `revalidatePath("/tasks")` + `revalidatePath("/calendar")`). No core/wrapper split, no conflict check — same precedent as `toggleTaskComplete`/`deleteTask`, which skip both for mutations this small.
- `archiveAllCompletedTasks()` — new, bulk version: `update tasks set archived_at = now() where user_id = X and completed_at is not null and archived_at is null`.
- `toggleTaskComplete` gains one line: when un-completing (`completed === false`), also clear `archived_at`. This is what makes "uncheck restores it" true — an archived task can't end up active-but-still-archived.

**`app/(app)/tasks/page.tsx`**: the existing two-way split (`active` / `completed`) becomes three-way:
```ts
const active = rows.filter((t) => t.completed_at === null);
const completed = rows.filter((t) => t.completed_at !== null && t.archived_at === null);
const archived = rows.filter((t) => t.archived_at !== null);
```
The Completed `<details>` section (unchanged otherwise) gains a small "Archive completed" button in its header, calling `archiveAllCompletedTasks()`. A second `<details>` section, "Archived" — same collapsed-by-default visual pattern, listing `archived.length` — renders below it when non-empty.

**`components/tasks/TaskRow.tsx`**: gains a small "Archive" action next to Delete, shown only when the task is completed (`completed && <button onClick={...archiveTask...}>Archive</button>`) — the per-task path.

**`components/tasks/ArchivedTaskRow.tsx`** (new) — a deliberately lighter row than `TaskRow` for the Archived section: checkbox (always checked; unchecking calls `toggleTaskComplete(id, false, dueAt)`, which un-completes *and* un-archives in one call per the `toggleTaskComplete` change above), title (plain text, not click-to-edit), due date, an "Unarchive" button (`unarchiveTask`), and the existing `ConfirmDeleteButton` (`deleteTask`). No tag picker, no linked-notes picker, no edit form.

**`components/tasks/ArchiveCompletedButton.tsx`** (new) — tiny client component wrapping `archiveAllCompletedTasks()` in a transition. No confirmation dialog, unlike delete — archiving is reversible, so the extra step isn't warranted.

## Testing Approach

- No new pure logic to unit test — this is schema + straightforward CRUD actions + UI wiring, matching the shape of the calendar-chip work rather than the due-date-grouping work.
- Manual verification in the browser: archive a task individually and via the bulk button; confirm it moves to Archived and disappears from Completed; unarchive it and confirm it's back in Completed; uncheck an archived task's checkbox and confirm it lands in the normal active list, not stuck archived-and-active.
- Full existing suite (`tsc`, lint, unit, integration, `next build`, Playwright e2e) must stay green.
