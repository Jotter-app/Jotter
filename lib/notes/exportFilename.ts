// Characters invalid (or awkward) in a filename across common filesystems
// and inside a zip archive path.
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

export function sanitizeFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(INVALID_FILENAME_CHARS, "-")
    .replace(/\s+/g, " ")
    // A title that was entirely invalid characters (e.g. "///") would
    // otherwise become a run of dashes instead of falling through to the
    // Untitled fallback below -- collapse repeats and strip leading/
    // trailing dashes so that case actually ends up empty.
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
  return cleaned || "Untitled";
}

// Notes can legitimately share a title in this app, but a directory in a
// zip can't hold two files with the same name -- appends "-2", "-3", ...
// on collision. Mutates `usedNames` so a whole export pass can call this
// once per file and get back a name unique within that same directory.
export function uniqueFilename(sanitizedTitle: string, usedNames: Set<string>): string {
  let candidate = `${sanitizedTitle}.md`;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${sanitizedTitle}-${suffix}.md`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}
