type FolderRef = { id: string; name: string; parent_folder_id: string | null };

/** Folder id/name pairs from root to leaf for a note's folder_id -- the
 * opposite direction of resolveFolderPath.ts (which resolves a path string
 * to a folder id for import), used here to render the editor's breadcrumb.
 * Each segment carries its id so the breadcrumb can link to
 * /notes?folder=<id>, not just display the name. */
export function folderBreadcrumb(
  folders: FolderRef[],
  folderId: string | null
): { id: string; name: string }[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: { id: string; name: string }[] = [];
  let current = byId.get(folderId);
  while (current) {
    path.unshift({ id: current.id, name: current.name });
    current = current.parent_folder_id ? byId.get(current.parent_folder_id) : undefined;
  }
  return path;
}
