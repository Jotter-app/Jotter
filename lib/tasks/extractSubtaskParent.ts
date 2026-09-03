// Unlike #tag (lib/markdown/extractTags.ts) -- a single word -- a task
// title is routinely multiple words ("Buy Groceries"), so this marker
// captures everything from ^ to the end of the string, trimmed, rather
// than stopping at the next space. That means ^ can only meaningfully
// appear once, as the last thing in the text -- callers should run this
// after any other extraction (dates, tags) that might otherwise get
// swallowed into the capture. See the subtasks design spec's Quick-Add
// Syntax section for why the ordering matters.
const SUBTASK_MARKER_PATTERN = /(?<!\S)\^(.+)$/;

/**
 * Extracts a trailing "^Parent Title" marker from quick-add text, the same
 * way extractAndStripTags extracts #tags -- strips the marker out and
 * returns what's left as the title. Falls back to the original text with
 * no parent when there's no marker, or when stripping would leave either
 * side empty (a title made up entirely of the marker, or a bare "^" with
 * nothing after it).
 */
export function extractSubtaskParent(text: string): { title: string; parentTitle: string | null } {
  const match = text.match(SUBTASK_MARKER_PATTERN);
  if (!match) return { title: text.trim(), parentTitle: null };

  const parentTitle = match[1].trim();
  const title = text.slice(0, match.index).trim();
  if (!parentTitle || !title) return { title: text.trim(), parentTitle: null };

  return { title, parentTitle };
}
