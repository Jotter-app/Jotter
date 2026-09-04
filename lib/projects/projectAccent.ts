// Same technique as lib/notes/notebookAccent.ts -- projects have no stored
// color/icon column (nobody asked for one), so a deterministic pick from a
// fixed rotation, keyed off the project id, gives every project a stable
// look without persisting anything.
const PROJECT_ACCENTS = [
  "bg-accent-2-100 text-accent-2-800",
  "bg-accent-100 text-accent-800",
  "bg-accent-2-200 text-accent-2-800",
  "bg-neutral-200 text-neutral-800",
  "bg-accent-200 text-accent-800",
] as const;

export function projectAccentClass(projectId: string): string {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PROJECT_ACCENTS.length;
  return PROJECT_ACCENTS[index];
}
