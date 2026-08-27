import { addWeeks, endOfDay, endOfMonth, endOfWeek, startOfDay } from "date-fns";

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
export function groupTasksByDueDate<T extends { due_at: string | null }>(
  tasks: T[],
  referenceDate: Date = new Date()
): DueDateGroups<T> {
  const todayStart = startOfDay(referenceDate);
  const todayEnd = endOfDay(referenceDate);
  const thisWeekEnd = endOfWeek(referenceDate);
  const nextWeekEnd = endOfWeek(addWeeks(referenceDate, 1));
  const thisMonthEnd = endOfMonth(referenceDate);

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
