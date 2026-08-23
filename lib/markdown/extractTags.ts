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
