import { differenceInCalendarDays } from "date-fns";

/**
 * Human-friendly relative-day label ("Today", "Tomorrow", "In 3 days",
 * "3 days ago"), based on calendar-day difference rather than raw hours --
 * "today at 11pm" and "today at 1am" should both read "Today".
 */
export function formatRelativeDays(date: Date, referenceDate: Date = new Date()): string {
  const diff = differenceInCalendarDays(date, referenceDate);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}
