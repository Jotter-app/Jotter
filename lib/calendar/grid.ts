import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/** Day keys are plain yyyy-MM-dd strings (local time), used as droppable
 * ids and to bucket events/tasks by day without timezone-conversion bugs
 * from toISOString() (which is UTC). */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Full weeks (Sun-Sat) covering the given month, including the leading/
 * trailing days of adjacent months needed to fill the grid. */
export function buildMonthGrid(monthDate: Date): Date[][] {
  const start = startOfWeek(startOfMonth(monthDate));
  const end = endOfWeek(endOfMonth(monthDate));
  const days = eachDayOfInterval({ start, end });

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

export function buildWeek(anyDateInWeek: Date): Date[] {
  return eachDayOfInterval({
    start: startOfWeek(anyDateInWeek),
    end: endOfWeek(anyDateInWeek),
  });
}

export function shiftByDays(iso: string, days: number): string {
  return addDays(new Date(iso), days).toISOString();
}
