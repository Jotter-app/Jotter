import { isPast } from "date-fns";
import { isTodayInTimeZone } from "@/lib/dates/relativeDays";

// Shared by TaskRow and TaskCard so a task's overdue/due-today styling can
// never drift between the list and board views.
export function dueDateStatus(dueAt: Date | null, completed: boolean, timeZone: string) {
  // isPast compares raw instants (`date.getTime() < Date.now()`), which is
  // timezone-invariant, so it's left as-is -- only the calendar-day check
  // needs the viewer's timezone, since "is this still today" depends on
  // where the viewer's midnight falls.
  const isOverdue = !completed && dueAt !== null && isPast(dueAt) && !isTodayInTimeZone(dueAt, timeZone);
  const isDueToday = dueAt !== null && isTodayInTimeZone(dueAt, timeZone);
  return { isOverdue, isDueToday };
}
