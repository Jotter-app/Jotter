// Notebooks have no stored color/icon (no such column exists, and adding
// one would be a schema change nobody asked for) -- the mockups' colored
// notebook circles are approximated with a deterministic pick from a fixed
// rotation, keyed off the folder id, so the same notebook always looks the
// same without persisting anything.
const NOTEBOOK_ACCENTS = [
  "bg-accent-100 text-accent-800",
  "bg-accent-2-100 text-accent-2-800",
  "bg-neutral-200 text-neutral-800",
  "bg-accent-200 text-accent-800",
  "bg-accent-2-200 text-accent-2-800",
] as const;

export function notebookAccentClass(folderId: string): string {
  let hash = 0;
  for (let i = 0; i < folderId.length; i++) {
    hash = (hash * 31 + folderId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % NOTEBOOK_ACCENTS.length;
  return NOTEBOOK_ACCENTS[index];
}
