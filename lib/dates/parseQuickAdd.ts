import * as chrono from "chrono-node";
import { tzOffset } from "@date-fns/tz";

export interface QuickAddResult {
  title: string;
  dueAt: Date | null;
  /** Set when chrono finds a two-sided range in the text ("2-3pm", "noon
   * to 1pm") -- used by Jotter's implicit routing to distinguish a
   * calendar event (has a range) from a plain due-point task. */
  endAt: Date | null;
}

// A preposition immediately before the matched date/time span reads oddly
// once the span is removed ("call mom at" instead of "call mom") -- chrono
// usually consumes these itself, but not always, so this is a safety net.
const DANGLING_CONNECTOR = /\s+(?:at|on|by|in|for)\s*$/i;

/**
 * Extracts a due date/time from freeform quick-add text (TickTick-style),
 * e.g. "call mom tomorrow 5pm" -> { title: "call mom", dueAt: <Date> }.
 *
 * Never blocks submission: if no date/time is found, the full input is
 * returned as the title with dueAt: null.
 *
 * `timeZone`, when given, is the IANA zone words like "today"/"tomorrow"/a
 * bare time are resolved against. Without it, chrono reads referenceDate's
 * calendar day and hour through the *executing runtime's own* zone -- fine
 * for a client component (the browser's zone genuinely is the viewer's),
 * but wrong for every Server Action, which runs in the server's zone (UTC
 * on Vercel). "today at 9:55pm" typed in the evening in a zone behind UTC
 * would then resolve "today" as the server's already-next calendar day,
 * landing the task on what reads as tomorrow to the viewer. Passed through
 * as a precomputed numeric UTC-offset (via tzOffset) rather than the zone
 * name itself -- chrono's own `timezone` option only resolves fixed
 * offsets and abbreviations (e.g. "EST"), not IANA names, and silently
 * no-ops on anything else it doesn't recognize.
 */
export function parseQuickAdd(input: string, referenceDate: Date = new Date(), timeZone?: string): QuickAddResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { title: "", dueAt: null, endAt: null };
  }

  const offset = timeZone ? tzOffset(timeZone, referenceDate) : NaN;
  const chronoRefDate = Number.isNaN(offset) ? referenceDate : { instant: referenceDate, timezone: offset };

  const results = chrono.parse(trimmed, chronoRefDate, { forwardDate: true });

  if (results.length === 0) {
    return { title: trimmed, dueAt: null, endAt: null };
  }

  const match = results[0];
  const before = trimmed.slice(0, match.index).replace(DANGLING_CONNECTOR, "");
  const after = trimmed.slice(match.index + match.text.length);
  const title = `${before} ${after}`.replace(/\s{2,}/g, " ").trim();

  return {
    title: title.length > 0 ? title : trimmed,
    dueAt: match.date(),
    endAt: match.end ? match.end.date() : null,
  };
}
