export interface WikilinkCandidate {
  id: string;
  title: string;
  updated_at: string;
}

// No nested brackets inside the label -- matches how the rest of this
// app's inline syntax (hashtags, Jotter commands) keeps parsing simple
// rather than handling markdown-inside-wikilink edge cases nobody asked
// for.
const WIKILINK_RE = /\[\[([^[\]]+)\]\]/g;

export function extractWikilinkTitles(body: string): string[] {
  const titles = new Set<string>();
  for (const match of body.matchAll(WIKILINK_RE)) {
    const title = match[1].trim();
    if (title) titles.add(title);
  }
  return [...titles];
}

// Case-insensitive; when a title is ambiguous (more than one note shares
// it), the most recently edited note wins -- see the design spec's
// Error Handling section. Shared by both the client-side renderer (is this
// link broken?) and the server-side sync (lib/actions/noteLinks.ts), so
// the two can never disagree about what a title resolves to.
export function resolveWikilinkTitle(title: string, candidates: WikilinkCandidate[]): WikilinkCandidate | null {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return null;

  let best: WikilinkCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.title.trim().toLowerCase() !== normalized) continue;
    if (!best || candidate.updated_at > best.updated_at) best = candidate;
  }
  return best;
}
