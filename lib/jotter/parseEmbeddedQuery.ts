export interface EmbeddedQuery {
  pillar: "task" | "note";
  tag?: string;
  /** Tasks only. */
  status?: "open" | "done";
  /** Tasks only. */
  due?: "today" | "overdue" | "week";
}

// Requires the keyword immediately after "?" ("?tasks", not "? tasks"), so
// an ordinary line of prose that happens to start with a literal "?" is
// essentially never mistaken for a query.
const QUERY_LINE = /^\?(tasks|notes)(?:\s|$)(.*)$/i;

/**
 * Parses a Dataview-style embedded query line, e.g. "?tasks #client-x
 * status:open" or "?notes #project-x". Unrecognized filter tokens are
 * silently dropped rather than rejecting the whole line -- same
 * never-block-on-a-malformed-detail posture as parseQuickAdd elsewhere in
 * this app. due:/status: are parsed but ignored for a ?notes query, since
 * neither applies to notes.
 */
export function parseEmbeddedQuery(line: string): EmbeddedQuery | null {
  const match = line.trim().match(QUERY_LINE);
  if (!match) return null;

  const pillar: EmbeddedQuery["pillar"] = match[1].toLowerCase() === "tasks" ? "task" : "note";
  const rest = match[2];
  const tag = rest.match(/#([a-zA-Z][\w-]*)/)?.[1]?.toLowerCase();

  if (pillar === "note") {
    return { pillar, tag };
  }

  const status = rest.match(/status:(open|done)/i)?.[1]?.toLowerCase() as EmbeddedQuery["status"];
  const due = rest.match(/due:(today|overdue|week)/i)?.[1]?.toLowerCase() as EmbeddedQuery["due"];
  return { pillar, tag, status, due };
}
