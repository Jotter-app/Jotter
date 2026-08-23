import * as chrono from "chrono-node";

export interface QuickAddResult {
  title: string;
  dueAt: Date | null;
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
 */
export function parseQuickAdd(input: string, referenceDate: Date = new Date()): QuickAddResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { title: "", dueAt: null };
  }

  const results = chrono.parse(trimmed, referenceDate, { forwardDate: true });

  if (results.length === 0) {
    return { title: trimmed, dueAt: null };
  }

  const match = results[0];
  const before = trimmed.slice(0, match.index).replace(DANGLING_CONNECTOR, "");
  const after = trimmed.slice(match.index + match.text.length);
  const title = `${before} ${after}`.replace(/\s{2,}/g, " ").trim();

  return {
    title: title.length > 0 ? title : trimmed,
    dueAt: match.date(),
  };
}
