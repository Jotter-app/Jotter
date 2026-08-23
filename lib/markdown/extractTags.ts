// Matches #hashtag tokens but not markdown headers ("## Heading") or
// consecutive #'s: the tag must start with a letter, and the # itself must
// not be immediately preceded by another # or a word character.
const HASHTAG_PATTERN = /(?<![#\w])#([a-zA-Z][\w-]*)/g;

/**
 * Extracts unique #hashtag names (without the leading #) from note markdown,
 * lowercased, in first-seen order.
 */
export function extractTags(markdown: string): string[] {
  const seen = new Set<string>();
  for (const match of markdown.matchAll(HASHTAG_PATTERN)) {
    seen.add(match[1].toLowerCase());
  }
  return [...seen];
}

/**
 * For short-form text (quick-add task titles, not note bodies): extracts
 * tags the same way as extractTags, but also strips the #tag tokens out of
 * the text, cleaning up the comma/whitespace debris they leave behind --
 * "buy milk #errands, #shopping tomorrow" -> { title: "buy milk tomorrow",
 * tags: ["errands", "shopping"] }. Falls back to the original text if
 * stripping would leave nothing (a title made up entirely of tags), same
 * as parseQuickAdd's "never block submission" rule.
 */
export function extractAndStripTags(text: string): { title: string; tags: string[] } {
  const tags = extractTags(text);
  const stripped = text
    .replace(HASHTAG_PATTERN, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/(^\s*,\s*)|(\s*,\s*$)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { title: stripped.length > 0 ? stripped : text.trim(), tags };
}
