/**
 * Converts a <input type="datetime-local"> value (a timezone-naive
 * wall-clock string, e.g. "2026-08-28T20:00" -- the HTML spec guarantees
 * no timezone/offset is ever present) into a proper UTC ISO string.
 *
 * MUST be called client-side, in the browser. `new Date(naiveString)`
 * interprets a timezone-naive datetime string in whatever timezone the
 * *executing* JS runtime is in -- in the browser that's correctly the
 * user's own timezone, which is what they meant when they picked the
 * time. Calling this same conversion on the server would silently
 * reinterpret the string in the server's runtime timezone instead (UTC on
 * Vercel), shifting the stored time by the user's UTC offset -- this is
 * the exact bug this function exists to avoid: a task/event's due time
 * editable via a plain <input type="datetime-local"> must be converted to
 * an unambiguous UTC instant before it ever crosses the network to a
 * server action, not after.
 */
export function localDatetimeInputToUtcIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
