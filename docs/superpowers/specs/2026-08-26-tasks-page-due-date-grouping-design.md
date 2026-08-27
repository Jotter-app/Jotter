# Tasks Page: Due-Date Grouping — Design Spec

**Date:** 2026-08-26
**Status:** Approved for planning

## Summary

Splits the tasks page's unbounded "Upcoming" section into three time-boxed sections — This Week, Next Week, This Month — so the page stays readable once recurring tasks (Phase 2, not yet built) start materializing many future occurrences. Tasks due beyond the current calendar month are no longer listed on this page at all; a single link points to the calendar view instead.

## Goals

- Bound the tasks page's length regardless of how many future tasks/occurrences exist.
- Keep every section's meaning legible at a glance (a task's bucket should be obvious from today's date, no memorized rules).
- Never silently hide a task with no trail back to it — anything past "This Month" is still reachable via a visible link.

## Non-Goals

- Recurring tasks themselves — this only prepares the display for their arrival.
- Per-section caps/pagination within This Week/Next Week/This Month — out of scope until real usage shows a need.
- A user-configurable week-start day — matches the Calendar page's existing (Sunday-start) default.
- Changing Overdue, Today, No due date, or Completed — untouched.

## Design

`lib/tasks/groupTasksByDueDate.ts` — a new pure function, `groupTasksByDueDate(tasks, referenceDate)`, returns the bucketed lists plus a `laterCount`. Bucketing uses `date-fns`'s `startOfWeek`/`endOfWeek` (default Sunday-start, matching `app/(app)/calendar/page.tsx`'s existing convention) and `endOfMonth`, evaluated relative to `referenceDate` (defaults to `new Date()`, overridable for tests):

| Bucket | Range |
|---|---|
| Overdue | due before start of today *(unchanged)* |
| Today | due today *(unchanged)* |
| This Week | due after today, through end of this calendar week |
| Next Week | due after this week, through end of next calendar week |
| This Month | due after next week, through end of this calendar month |
| *(later, not a listed bucket)* | due after this calendar month — counted only, as `laterCount` |
| No due date | *(unchanged)* |

Buckets are mutually exclusive and exhaustive over "has a due date." This Month can legitimately end up empty (e.g. when Next Week already spans into next month) — matches the page's existing behavior of hiding empty sections.

`app/(app)/tasks/page.tsx` calls this instead of computing `upcoming` inline, and renders one more section per non-empty bucket using the exact same card/dot/ring pattern already used for Overdue/Today/Upcoming — This Week, Next Week, and This Month all use the neutral "Upcoming" styling (muted dot, no ring), so only Overdue (destructive) and Today (primary) carry an accent color.

Below the sections, when `laterCount > 0`: a single small row — "*N more tasks — view on calendar*" — linking to `/calendar`. No date deep-link; lands on the calendar's own default view.

## Testing Approach

- **Unit tests** (`tests/unit/groupTasksByDueDate.test.ts`): boundary edge cases — a task due exactly at a week/month boundary, Next Week spilling past month-end (This Month empty), a reference date near year-end (month/week math crossing into January), no active tasks, only no-due-date tasks.
- **Manual verification**: visual check in the browser that sections render in order, empty buckets stay hidden, and the "N more" link appears/links correctly when applicable.
