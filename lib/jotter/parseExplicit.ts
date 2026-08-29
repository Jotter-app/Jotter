import { parseQuickAdd } from "@/lib/dates/parseQuickAdd";
import { extractAndStripTags, extractTags } from "@/lib/markdown/extractTags";
import { applyDurationRegex } from "@/lib/jotter/duration";
import type { JotterIntent, JotterRoute } from "@/lib/jotter/types";

export interface ExplicitParseResult {
  ok: boolean;
  intent: JotterIntent | null;
  error: string | null;
}

const PILLARS: readonly JotterRoute[] = ["task", "event", "note"];
const QUOTED = /"([^"]*)"/g;
const QUOTED_PREFIX = /^"([^"]*)"\s*(.*)$/;

function fail(error: string): ExplicitParseResult {
  return { ok: false, intent: null, error };
}

/**
 * Parses `/task create "title" ...`-style explicit commands (see
 * docs/superpowers/specs/2026-08-23-jotter-design.md's grammar). Whenever
 * the title isn't given in quotes, the remainder falls through to the same
 * parseQuickAdd + tag extraction implicit mode uses -- no second date
 * parser, no second tag grammar. The input is never partially consumed and
 * discarded on error: a failure just returns a message, the caller decides
 * what stays in the input box.
 */
export function parseExplicit(input: string, referenceDate: Date = new Date(), timeZone?: string): ExplicitParseResult {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return fail("Commands start with /.");
  }

  const withoutSlash = trimmed.slice(1);
  const firstSpace = withoutSlash.search(/\s/);
  const pillarToken = (firstSpace === -1 ? withoutSlash : withoutSlash.slice(0, firstSpace)).toLowerCase();

  if (!pillarToken) {
    return fail("Type a pillar: /task, /event, or /note.");
  }
  if (!PILLARS.includes(pillarToken as JotterRoute)) {
    return fail(`Unknown pillar "${pillarToken}" -- try task, event, or note.`);
  }
  const route = pillarToken as JotterRoute;

  const afterPillar = firstSpace === -1 ? "" : withoutSlash.slice(firstSpace + 1).trimStart();
  const secondSpace = afterPillar.search(/\s/);
  const actionToken = (secondSpace === -1 ? afterPillar : afterPillar.slice(0, secondSpace)).toLowerCase();

  if (!actionToken) {
    return fail(`Type an action: /${route} create ...`);
  }
  if (actionToken !== "create") {
    return fail(`"${actionToken}" isn't a supported action yet -- only create is available.`);
  }

  const remainder = (secondSpace === -1 ? "" : afterPillar.slice(secondSpace + 1)).trim();

  if (route === "note") {
    const quoted = [...remainder.matchAll(QUOTED)].map((m) => m[1]);
    if (quoted.length < 2) {
      return fail('Notes need a title and content in quotes: /note create "title" "content"');
    }
    const [title, ...bodyParts] = quoted;
    const body = bodyParts.join(" ");
    return {
      ok: true,
      intent: {
        route: "note",
        title: title || "Untitled",
        noteBody: body,
        dueAt: null,
        endAt: null,
        tags: extractTags(body),
      },
      error: null,
    };
  }

  // task or event: an optional quoted primary title; everything after it
  // (or the whole remainder, if unquoted) is parsed the same way implicit
  // mode parses date/time and tags.
  const quotedPrefix = remainder.match(QUOTED_PREFIX);
  const explicitTitle = quotedPrefix ? quotedPrefix[1] : null;
  const dateSource = quotedPrefix ? quotedPrefix[2] : remainder;

  const { title: parsedTitle, dueAt, endAt: chronoEndAt } = parseQuickAdd(dateSource, referenceDate, timeZone);
  const { title: leftoverAfterTags, tags } = extractAndStripTags(parsedTitle);

  if (!dueAt) {
    return fail(`${route === "event" ? "Events" : "Tasks"} need a date/time -- try "tomorrow 5pm".`);
  }

  // Duration/tags are always read from the dateSource-derived leftover, not
  // from an explicit quoted title -- "team sync" for
  // `/event create "team sync" tomorrow 2pm for 1 hour` shouldn't be
  // searched for "for 1 hour" itself.
  const duration = chronoEndAt
    ? { title: leftoverAfterTags, endAt: chronoEndAt }
    : applyDurationRegex(leftoverAfterTags, dueAt);

  const title = explicitTitle ?? duration.title;
  if (!title) {
    return fail("Enter a title.");
  }

  return {
    ok: true,
    intent: { route, title, dueAt, endAt: duration.endAt, tags },
    error: null,
  };
}
