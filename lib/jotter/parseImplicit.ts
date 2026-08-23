import { parseQuickAdd } from "@/lib/dates/parseQuickAdd";
import { extractAndStripTags, extractTags } from "@/lib/markdown/extractTags";
import { applyDurationRegex } from "@/lib/jotter/duration";
import type { JotterIntent } from "@/lib/jotter/types";

// Routing threshold for "this reads as a note, not a short task/event" when
// there's no newline to make the call obvious. Named constant rather than a
// magic number buried in the logic below.
const SHORT_INPUT_MAX_WORDS = 12;

function isNoteShaped(text: string): boolean {
  return text.includes("\n") || text.split(/\s+/).filter(Boolean).length > SHORT_INPUT_MAX_WORDS;
}

function deriveNoteTitleAndBody(text: string): { title: string; body: string } {
  const firstNewline = text.indexOf("\n");
  if (firstNewline === -1) {
    const title = text.length > 60 ? `${text.slice(0, 60).trim()}...` : text;
    return { title, body: text };
  }
  const title = text.slice(0, firstNewline).trim();
  const body = text.slice(firstNewline + 1).trim();
  return { title: title || "Untitled", body };
}

/**
 * Infers a task, event, or note from freeform text with no leading `/` --
 * the implicit half of Jotter's routing (see
 * docs/superpowers/specs/2026-08-23-jotter-design.md). A long or multi-line
 * input always reads as a note, regardless of any date-like phrase it might
 * incidentally contain; otherwise the exact same parseQuickAdd used by
 * today's task quick-add decides the due date, and a detected time range
 * (native chrono range, or the duration regex above) is what distinguishes
 * an event from a plain due-dated task.
 */
export function parseImplicit(input: string, referenceDate: Date = new Date()): JotterIntent {
  const trimmed = input.trim();

  if (isNoteShaped(trimmed)) {
    const tags = extractTags(trimmed);
    const { title, body } = deriveNoteTitleAndBody(trimmed);
    return { route: "note", title, noteBody: body, dueAt: null, endAt: null, tags };
  }

  const { title: titleWithTags, dueAt, endAt: chronoEndAt } = parseQuickAdd(trimmed, referenceDate);
  const { title, tags } = extractAndStripTags(titleWithTags);

  if (!dueAt) {
    return { route: "task", title, dueAt: null, endAt: null, tags };
  }

  if (chronoEndAt) {
    return { route: "event", title, dueAt, endAt: chronoEndAt, tags };
  }

  const duration = applyDurationRegex(title, dueAt);
  return {
    route: duration.endAt ? "event" : "task",
    title: duration.title,
    dueAt,
    endAt: duration.endAt,
    tags,
  };
}
