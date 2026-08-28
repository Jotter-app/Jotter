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
  data: { tasks: QueryableTask[]; notes: QueryableNote[] },
  referenceDate: Date = new Date()
): EmbeddedQueryResult<QueryableTask | QueryableNote> {
  if (query.pillar === "note") {
    const matches = query.tag ? data.notes.filter((n) => n.tags.includes(query.tag!)) : data.notes;
    return { items: matches.slice(0, RESULT_LIMIT), totalCount: matches.length };
  }

  let matches = query.tag ? data.tasks.filter((t) => t.tags.includes(query.tag!)) : data.tasks;

  if (query.status) {
    matches = matches.filter((t) => (query.status === "done") === (t.completed_at !== null));
  }

  if (query.due) {
    const groups = groupTasksByDueDate(matches, referenceDate);
    matches =
      query.due === "overdue" ? groups.overdue : query.due === "today" ? groups.today : [...groups.today, ...groups.thisWeek];
  }

  return { items: matches.slice(0, RESULT_LIMIT), totalCount: matches.length };
}
