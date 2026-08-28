import { differenceInCalendarDays, isToday } from "date-fns";
import { TZDate } from "@date-fns/tz";

/**
 * Human-friendly relative-day label ("Today", "Tomorrow", "In 3 days",
 * "3 days ago"), based on calendar-day difference rather than raw hours --
 * "today at 11pm" and "today at 1am" should both read "Today".
 *
 * `timeZone` is required, not defaulted, on purpose: both `date` and
 * `referenceDate` are compared as calendar days *in that zone*, via
 * `@date-fns/tz`'s TZDate, instead of date-fns's default of whichever
 * timezone the executing JS runtime happens to be in. A defaulted "local"
 * timezone is exactly what caused this to disagree between the server
 * render (server's runtime timezone, e.g. UTC on Vercel) and the browser's
 * hydration render (the viewer's actual timezone) -- see useTimeZone.
 */
export function formatRelativeDays(
  date: Date | string,
  timeZone: string,
  referenceDate: Date | string = new Date()
): string {
  // Normalized to Date first -- TZDate's overloads resolve cleanly against
  // a single concrete type, not the `Date | string` union these params
  // accept for caller convenience.
  const diff = differenceInCalendarDays(
    new TZDate(new Date(date), timeZone),
    new TZDate(new Date(referenceDate), timeZone)
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

// Same "which calendar day, in which zone" concern as formatRelativeDays --
// shared here so callers needing a plain boolean (e.g. "should this due
// date get the Today badge") don't reach for date-fns's own `isToday`,
// which would reintroduce the exact mismatch this file exists to avoid.
export function isTodayInTimeZone(date: Date | string, timeZone: string): boolean {
  return isToday(new TZDate(new Date(date), timeZone));
}
