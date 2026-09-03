# Subtasks — Design Spec

**Date:** 2026-09-03
**Status:** Approved for planning

## Summary

First piece of "core task depth" (the second item on the sale-prep "Keep" list, after calendar sync). A task can have a flat checklist of subtasks under it — title and completion only, one level of nesting, no schema migration needed since `tasks.parent_task_id` has existed unused since Milestone 1 for exactly this. Subtasks can be added inline under a task row, or via a new `^ParentTitle` marker in the quick-add bar, parallel to the existing `#tag` marker.

## Goals

- A task can have a checklist of subtasks, each with just a title and a checkbox.
- Checking off the parent task also checks off every subtask under it, in one action.
- The parent row shows subtask progress ("2/3 done") at a glance without opening anything.
- A subtask can be added either inline under its parent's row, or from the quick-add bar via `^ParentTitle`.
- None of this requires a new table or migration — it's additive to the existing `tasks` row shape and query patterns.

## Non-Goals

- **No promoting/demoting an existing task into someone else's subtask.** The only way a task becomes a subtask is being created as one; there's no "attach this existing task under that one" action. Narrows the surface a lot — no re-parenting edge cases (what if the target already has subtasks, what if it would create a cycle, etc.).
- **No subtask-level due date, priority, tags, notes-linking, or calendar-linking.** A subtask is title + checkbox, full stop. Every other task feature stays a top-level-task-only concept.
- **No multi-level nesting.** A task that already has a `parent_task_id` can never itself become a parent — enforced in the insert path, not just a UI convention.
- **No auto-completing the parent when all its subtasks get checked off.** Progress is shown, but the parent only completes when explicitly checked — same "completion is always an explicit action" reasoning already applied elsewhere (e.g. un-completing a task doesn't silently undo its journal entries).
- **No independent Completed/Archived sections for subtasks.** They only ever render nested under their parent row; a subtask's own `completed_at` drives its checkbox state, but there's no separate list anywhere that shows subtasks on their own.

## Data Model

No migration. `tasks.parent_task_id uuid references tasks(id) on delete cascade` already exists and is already unused — deleting a parent task already correctly cascades to delete its subtasks at the database level, with nothing new to add. A subtask is simply a `tasks` row with `parent_task_id` set to its parent's id; every other column it doesn't need (`due_at`, `priority`, `recurrence_rule`) is just left at its default/null, same as any row that doesn't use a given feature.

One-level-only is enforced at the application layer: creating a subtask under a task that itself already has a non-null `parent_task_id` is rejected (falls back to creating a normal top-level task — see Quick-Add Syntax).

## Queries & Rendering

**`app/(app)/tasks/page.tsx`**: the existing `tasks` query gains `.is("parent_task_id", null)` so subtasks stop appearing as their own independent entries in the Overdue/Today/This Week/etc. buckets (today, with no filter, they'd render twice — once correctly nested under their parent, once again as a stray top-level row landing wherever their own, irrelevant `due_at` happens to be, which for a subtask is always null anyway since subtasks don't have due dates). A second query fetches every subtask belonging to this user's tasks in one shot and groups them into a `Map<parentTaskId, Task[]>`, the same query-then-map pattern this page already uses for `tagsByTaskId` and `linkedNotesByTaskId`.

**`components/tasks/SubtaskChecklist.tsx`** (new): rendered inside `TaskRow` in the same always-visible slot as the existing `TagPicker`/`LinkedNotesPicker` (not gated behind `editing` state) — a task's subtasks should be checkable without entering edit mode. Shows each subtask as a plain `Checkbox` + title (no priority dot, no due-date pill, no per-subtask actions beyond checking it off and deleting it), plus a small text input at the bottom ("Add a subtask...") that creates another one on Enter.

**`TaskRow.tsx`**: gains a small "2/3" progress count next to the title whenever `subtasks.length > 0`, computed from the already-fetched subtask list (no extra query).

## Actions (`lib/actions/tasks.ts`)

- **`insertSubtaskCore(supabase, userId, parentTaskId, title)`** — checks the parent's own `parent_task_id` is null (rejects nesting under a subtask by returning an error rather than silently creating a second-level row); inserts a `tasks` row with `parent_task_id: parentTaskId` and no due date/tags. Wrapped by `insertSubtask(parentTaskId, formData)` for the inline add form, following the existing `*Core`/action-wrapper split.
- **`toggleTaskComplete`** (existing, extended): when completing a task that has subtasks (a plain `.select()` for rows with `parent_task_id = taskId` and `completed_at is null`), batch-updates all of them to `completed_at = now()` in the same call. Un-completing the parent does **not** touch subtasks, matching the Non-Goals reasoning. Completing/un-completing a subtask directly continues to call the exact same `toggleTaskComplete` unchanged — a subtask is just a task row, so the existing function already works for it as-is; the only new behavior is the parent's cascade-down.
- Deleting a subtask reuses the existing `deleteTask(taskId)` directly — a subtask is just a `tasks` row, so nothing new is needed here.

## Quick-Add Syntax

**`lib/markdown/extractTags.ts`**-adjacent: a new `lib/tasks/extractSubtaskParent.ts` with `SUBTASK_MARKER_PATTERN = /(?<!\S)\^(.+)$/` extracting a `^ParentTitle` token and stripping it. Unlike `#tag` (a single word, per `HASHTAG_PATTERN`), a task title is routinely multiple words ("Buy Groceries"), so the marker captures **everything from `^` to the end of the string**, trimmed, rather than stopping at the next space — meaning `^` can only meaningfully appear once, as the last thing in the text.

That "capture to end of string" behavior is exactly why processing order matters, and why it's the *last* extraction to run, in `createTaskFromQuickAdd`:
1. `parseQuickAdd` extracts/strips a date first (unchanged) — so a trailing date phrase like "tomorrow 5pm" isn't swallowed into the parent-title capture.
2. `extractAndStripTags` extracts/strips `#tags` next (unchanged) — so a trailing tag isn't swallowed either. `"Pick 2% ^Groceries #dairy"` strips `#dairy` first, leaving `"Pick 2% ^Groceries"` for the marker to correctly resolve `"Groceries"` from.
3. `extractSubtaskParent` runs last, on whatever text remains, capturing everything after `^` as the candidate parent title and leaving whatever's before it (trimmed) as the subtask's own title.

Resolution: case-insensitive exact-title match against the current user's own active (`completed_at is null`), top-level (`parent_task_id is null`) tasks. Exactly one match → `insertSubtaskCore` under it (dropping any parsed `dueAt`/`tagNames` from steps 1-2, since subtasks don't carry them — see Non-Goals). Zero or ambiguous (multiple) matches → falls back to `insertTaskCore` as an ordinary top-level task, with the `^Marker` text still stripped from the title so it never shows up as literal syntax debris — never blocking submission, matching quick-add's existing "text it can't parse just doesn't apply" philosophy for dates.

## Error Handling & Edge Cases

- **Deleting a parent with open subtasks**: already handled by the existing `on delete cascade` — no new code needed, subtasks simply go with it.
- **A quick-add `^Marker` matches a task that is itself a subtask**: treated as no match (falls back to top-level creation) — a subtask can never become a grandparent via this path either.
- **Two active top-level tasks share the exact same title**: ambiguous, falls back to top-level creation rather than guessing which one was meant.
- **Completing a parent with zero subtasks**: the batch update against `parent_task_id = taskId AND completed_at is null` simply matches nothing — no special-casing needed, the query is naturally a no-op.

## Testing Approach

- **Unit tests**: `extractSubtaskParent` (marker extraction/stripping, including the "no marker present" and "marker with no remaining title" edge cases, mirroring `extractTags.test.ts`'s existing coverage style for `#tag`).
- **Integration tests**: `insertSubtaskCore` rejecting nesting under an existing subtask; `toggleTaskComplete` cascading completion down to subtasks but not back up, and not touching subtasks on un-complete; the cascade-delete already provided by the schema (confirms it, doesn't newly implement it); the quick-add `^Marker` resolution's three outcomes (exact match, no match, ambiguous match).
- **Manual verification**: add a few subtasks to a task inline, confirm the progress count updates live; check the parent and confirm every subtask checks off with it; quick-add `"Pick 2% ^Groceries"` against an existing "Groceries" task and confirm it lands as a subtask; quick-add the same marker against a nonexistent title and confirm it lands as a normal top-level task with a clean title.
- Full existing suite must stay green.
