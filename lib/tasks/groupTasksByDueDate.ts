import { addWeeks, endOfDay, endOfMonth, endOfWeek, startOfDay } from "date-fns";
import { TZDate } from "@date-fns/tz";

export interface DueDateGroups<T> {
  overdue: T[];
  today: T[];
  thisWeek: T[];
  nextWeek: T[];
  thisMonth: T[];
  // Not returned as a list -- deliberately just a count, so a task due
  // further out than this calendar month never grows this page; the
  // calendar view is where those live.
  laterCount: number;
  noDueDate: T[];
}

// Buckets are mutually exclusive and exhaustive over "has a due date."
// Thresholds are checked in ascending order, so when a later threshold
// (e.g. next week's end) falls past an earlier one (this month's end --
// happens whenever today is near month-end), the earlier bucket is simply
// skipped over rather than needing special-casing: a date that's already
// within next week claims the "next week" bucket before "this month" is
// ever considered, and This Month legitimately ends up empty.
// `timeZone` is required, not defaulted -- see formatRelativeDays for why a
// defaulted "local" timezone is exactly the bug this parameter closes off.
// The week/month boundaries below must be computed in the *viewer's* zone,
// not whichever runtime executes this (this function runs server-side, in
// a Server Component that never hydrates, so a wrong zone here doesn't
// throw a hydration error the way a mismatched Client Component would --
// it just silently sorts a task into the wrong section, invisibly, since
// nothing client-side ever recomputes or corrects it).
export function groupTasksByDueDate<T extends { due_at: string | null }>(
  tasks: T[],
  timeZone: string,
  referenceDate: Date = new Date()
): DueDateGroups<T> {
  const zonedReference = new TZDate(referenceDate, timeZone);
  const todayStart = startOfDay(zonedReference);
  const todayEnd = endOfDay(zonedReference);
  const thisWeekEnd = endOfWeek(zonedReference);
  const nextWeekEnd = endOfWeek(addWeeks(zonedReference, 1));
  const thisMonthEnd = endOfMonth(zonedReference);

  const groups: DueDateGroups<T> = {
    overdue: [],
    today: [],
    thisWeek: [],
    nextWeek: [],
    thisMonth: [],
    laterCount: 0,
    noDueDate: [],
  };

  for (const task of tasks) {
    if (!task.due_at) {
      groups.noDueDate.push(task);
      continue;
    }

    const due = new Date(task.due_at);
    if (due < todayStart) groups.overdue.push(task);
    else if (due <= todayEnd) groups.today.push(task);
    else if (due <= thisWeekEnd) groups.thisWeek.push(task);
    else if (due <= nextWeekEnd) groups.nextWeek.push(task);
    else if (due <= thisMonthEnd) groups.thisMonth.push(task);
    else groups.laterCount += 1;
  }

  return groups;
}
