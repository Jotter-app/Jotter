import { startOfDay, endOfDay } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { groupTasksByDueDate } from "@/lib/tasks/groupTasksByDueDate";
import type { EmbeddedQuery } from "@/lib/jotter/parseEmbeddedQuery";

export interface QueryableTask {
  id: string;
  title: string;
  completed_at: string | null;
  due_at: string | null;
  tags: string[];
}

export interface QueryableNote {
  id: string;
  title: string;
  tags: string[];
}

export interface QueryableEvent {
  id: string;
  title: string;
  start_at: string;
  tags: string[];
}

export interface EmbeddedQueryResult<T> {
  items: T[];
  totalCount: number;
}

const RESULT_LIMIT = 10;

/**
 * Filters an in-memory snapshot of the user's tasks/notes against a parsed
 * embedded query. "Live" here means recomputed synchronously from the same
 * page-load snapshot the editor already uses for wikilink autocomplete and
 * linked-task checkboxes -- not a realtime subscription. The due: filter
 * reuses groupTasksByDueDate's existing buckets rather than introducing a
 * second set of date thresholds.
 */
export function runEmbeddedQuery(
  query: EmbeddedQuery,
  data: { tasks: QueryableTask[]; notes: QueryableNote[]; events?: QueryableEvent[] },
  referenceDate: Date = new Date(),
  // Defaulted to the executing runtime's own local timezone is safe here
  // (unlike groupTasksByDueDate's own required timeZone param) because
  // this function only ever runs client-side, from the CodeMirror
  // embedded-query widget (see embeddedQueryPlugin.ts) -- there's no
  // server render of this output to disagree with, so "whichever runtime
  // executes this" is always correctly the viewer's own browser.
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): EmbeddedQueryResult<QueryableTask | QueryableNote | QueryableEvent> {
  if (query.pillar === "note") {
    const matches = query.tag ? data.notes.filter((n) => n.tags.includes(query.tag!)) : data.notes;
    return { items: matches.slice(0, RESULT_LIMIT), totalCount: matches.length };
  }

  if (query.pillar === "event") {
    const events = data.events ?? [];
    let matches = query.tag ? events.filter((e) => e.tags.includes(query.tag!)) : events;
    // Only "today" applies to events -- "overdue"/"week" and status: are
    // parsed by parseEmbeddedQuery but have no meaningful event semantics,
    // so they're simply not applied here (same no-op posture as
    // due:/status: on a ?notes query).
    if (query.due === "today") {
      const zonedReference = new TZDate(referenceDate, timeZone);
      const start = startOfDay(zonedReference);
      const end = endOfDay(zonedReference);
      matches = matches.filter((e) => {
        const startAt = new Date(e.start_at);
        return startAt >= start && startAt <= end;
      });
    }
    return { items: matches.slice(0, RESULT_LIMIT), totalCount: matches.length };
  }

  let matches = query.tag ? data.tasks.filter((t) => t.tags.includes(query.tag!)) : data.tasks;

  if (query.status) {
    matches = matches.filter((t) => (query.status === "done") === (t.completed_at !== null));
  }

  if (query.due) {
    const groups = groupTasksByDueDate(matches, timeZone, referenceDate);
    matches =
      query.due === "overdue" ? groups.overdue : query.due === "today" ? groups.today : [...groups.today, ...groups.thisWeek];
  }

  return { items: matches.slice(0, RESULT_LIMIT), totalCount: matches.length };
}
