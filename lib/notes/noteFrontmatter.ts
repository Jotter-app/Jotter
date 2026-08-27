export interface NoteFrontmatter {
  title: string | null;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ParsedNoteFile {
  frontmatter: NoteFrontmatter;
  body: string;
}

// Always double-quotes title/tags (escaping internal ") rather than only
// quoting when "needed" -- simplest way to stay valid YAML regardless of
// what characters a title contains, no conditional-quoting logic to get
// wrong. Dates are bare ISO-8601, a valid unquoted YAML scalar.
function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function serializeNoteFrontmatter(
  frontmatter: { title: string; tags: string[]; createdAt: string; updatedAt: string },
  body: string
): string {
  const lines = [
    "---",
    `title: ${quote(frontmatter.title)}`,
    `tags: [${frontmatter.tags.map(quote).join(", ")}]`,
    `created: ${frontmatter.createdAt}`,
    `updated: ${frontmatter.updatedAt}`,
    "---",
    "",
    body,
  ];
  return lines.join("\n");
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

// Only the narrow flow-sequence shape this module itself writes --
// "[a, b, c]" with each element optionally quoted. Not general YAML.
function parseTagList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((part) => unquote(part.trim()))
    .filter((tag) => tag.length > 0);
}

// A hand-rolled reader for the narrow, self-controlled subset of YAML this
// module itself writes -- not a general frontmatter/YAML parser. Anything
// that doesn't look like exactly this shape (no frontmatter block at all,
// a block missing its closing "---", unrecognized keys) falls back to
// "whole file is the body, no frontmatter" rather than erroring -- an
// import should never fail just because a file was hand-edited or came
// from somewhere else.
export function parseNoteFile(content: string, fallbackTitle: string): ParsedNoteFile {
  const empty: NoteFrontmatter = { title: null, tags: [], createdAt: null, updatedAt: null };

  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") {
    return { frontmatter: empty, body: content };
  }

  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) {
    return { frontmatter: empty, body: content };
  }

  const frontmatter: NoteFrontmatter = { ...empty };
  for (const line of lines.slice(1, closingIndex)) {
    const match = /^(\w+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key === "title") frontmatter.title = unquote(rawValue) || fallbackTitle;
    else if (key === "tags") frontmatter.tags = parseTagList(rawValue);
    else if (key === "created") frontmatter.createdAt = rawValue.trim() || null;
    else if (key === "updated") frontmatter.updatedAt = rawValue.trim() || null;
  }

  // Body starts right after the closing "---", skipping the single blank
  // separator line serializeNoteFrontmatter always writes (if present).
  let bodyStart = closingIndex + 1;
  if (lines[bodyStart] === "") bodyStart += 1;
  const body = lines.slice(bodyStart).join("\n");

  return { frontmatter, body };
}
