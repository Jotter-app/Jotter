export interface LineEmbedMatch {
  type: string;
  videoId: string;
}

export interface LineEmbedMatcher {
  type: string;
  match(line: string): LineEmbedMatch | null;
}

// Real YouTube video ids are always exactly 11 chars of this charset.
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function parseYoutubeVideoId(raw: string): string | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");

  if (host === "youtube.com") {
    if (url.pathname === "/watch") {
      const v = url.searchParams.get("v");
      return v && VIDEO_ID_RE.test(v) ? v : null;
    }
    const match = /^\/(?:embed|shorts)\/([^/]+)$/.exec(url.pathname);
    return match && VIDEO_ID_RE.test(match[1]) ? match[1] : null;
  }

  if (host === "youtu.be") {
    const match = /^\/([^/]+)$/.exec(url.pathname);
    return match && VIDEO_ID_RE.test(match[1]) ? match[1] : null;
  }

  return null;
}

// "A line containing only a YouTube URL" (design spec, Feature 4) -- a URL
// with any surrounding prose on the same line never matches, so trailing
// whitespace inside the line is the only thing trimmed off before matching
// the whole thing against a URL shape.
export const YOUTUBE_MATCHER: LineEmbedMatcher = {
  type: "youtube",
  match(line) {
    const trimmed = line.trim();
    if (trimmed === "" || /\s/.test(trimmed)) return null;
    const videoId = parseYoutubeVideoId(trimmed);
    return videoId ? { type: "youtube", videoId } : null;
  },
};

// Registry, not a YouTube-specific one-off -- adding another platform later
// (per the design spec's Non-Goals, deferred but meant to be easy) is one
// more entry here, not a rewrite of the decoration plugin that consumes it.
const MATCHERS: LineEmbedMatcher[] = [YOUTUBE_MATCHER];

export function matchLineEmbed(line: string): LineEmbedMatch | null {
  for (const matcher of MATCHERS) {
    const result = matcher.match(line);
    if (result) return result;
  }
  return null;
}
