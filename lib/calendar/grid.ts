import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { TZDate } from "@date-fns/tz";

/** Day keys are plain yyyy-MM-dd strings, used as droppable ids and to
 * bucket events/tasks by day without timezone-conversion bugs from
 * toISOString() (which is UTC). `timeZone` is required, not defaulted --
 * reading `date`'s components via the ambient runtime zone (the previous
 * behavior) is exactly what let a UTC-hosted server and a viewer's browser
 * disagree on which calendar day an instant falls on. Wrapping in TZDate
 * makes the getters below report `date`'s components as seen in
 * `timeZone`, regardless of which machine executes this. */
export function dayKey(date: Date, timeZone: string): string {
  const zoned = new TZDate(date, timeZone);
  const y = zoned.getFullYear();
  const m = String(zoned.getMonth() + 1).padStart(2, "0");
  const d = String(zoned.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Full weeks (Sun-Sat) covering the given month, including the leading/
 * trailing days of adjacent months needed to fill the grid.
 *
 * `timeZone` is required -- `startOfMonth`/`startOfWeek`/`eachDayOfInterval`
 * all read and construct dates using whichever timezone the executing JS
 * runtime happens to be in. This component tree renders once server-side
 * (the server's own runtime zone, e.g. UTC on Vercel) and once more during
 * browser hydration (the viewer's actual zone) -- near a month or week
 * boundary in UTC, those two ambient zones can disagree on which *month*
 * `monthDate` even falls in, silently rendering an entirely different
 * month's grid between the two passes. Anchoring `monthDate` to `timeZone`
 * via TZDate before any date-fns call makes every date-fns function in this
 * pipeline (which all propagate a TZDate input through to their outputs)
 * resolve consistently against that one explicit zone instead. */
export function buildMonthGrid(monthDate: Date, timeZone: string): Date[][] {
  const zonedMonth = new TZDate(monthDate, timeZone);
  const start = startOfWeek(startOfMonth(zonedMonth));
  const end = endOfWeek(endOfMonth(zonedMonth));
  const days = eachDayOfInterval({ start, end });

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

/** See buildMonthGrid's doc comment -- same ambient-vs-explicit-timezone
 * concern applies to a single week. */
export function buildWeek(anyDateInWeek: Date, timeZone: string): Date[] {
  const zoned = new TZDate(anyDateInWeek, timeZone);
  return eachDayOfInterval({
    start: startOfWeek(zoned),
    end: endOfWeek(zoned),
  });
}

export function shiftByDays(iso: string, days: number): string {
  return addDays(new Date(iso), days).toISOString();
}
