import type { Database } from "@/lib/supabase/database.types";

type Folder = Database["public"]["Tables"]["folders"]["Row"];
export type NoteSummary = Pick<Database["public"]["Tables"]["notes"]["Row"], "id" | "title" | "folder_id">;

// Generic over the note shape so callers that need richer per-note data
// (e.g. the Notes dashboard's card grid, which also wants body/tags/updated_at)
// can reuse the same tree-building/traversal logic as the sidebar tree,
// which only ever needed id/title/folder_id.
export interface FolderNode<N extends { folder_id: string | null } = NoteSummary> extends Folder {
  children: FolderNode<N>[];
  notes: N[];
}

export function buildFolderTree<N extends { folder_id: string | null }>(folders: Folder[], notes: N[]) {
  const nodeById = new Map<string, FolderNode<N>>();
  for (const folder of folders) {
    nodeById.set(folder.id, { ...folder, children: [], notes: [] });
  }

  const roots: FolderNode<N>[] = [];
  for (const folder of folders) {
    const node = nodeById.get(folder.id)!;
    if (folder.parent_folder_id && nodeById.has(folder.parent_folder_id)) {
      nodeById.get(folder.parent_folder_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const rootNotes: N[] = [];
  for (const note of notes) {
    if (note.folder_id && nodeById.has(note.folder_id)) {
      nodeById.get(note.folder_id)!.notes.push(note);
    } else {
      rootNotes.push(note);
    }
  }

  return { roots, rootNotes };
}

/** Total notes anywhere in a folder's subtree (itself plus every nested
 * descendant), for surfacing an accurate impact count before a destructive
 * delete -- node.notes alone only covers this folder's direct notes. */
export function countNotesInSubtree<N extends { folder_id: string | null }>(node: FolderNode<N>): number {
  return node.notes.length + node.children.reduce((sum, child) => sum + countNotesInSubtree(child), 0);
}

/** Every note anywhere in a folder's subtree (itself plus every nested
 * descendant) as a flat list -- same traversal as countNotesInSubtree, but
 * collecting the notes themselves for the dashboard's "group by top-level
 * notebook" card view rather than just a count. */
export function collectNotesInSubtree<N extends { folder_id: string | null }>(node: FolderNode<N>): N[] {
  return [...node.notes, ...node.children.flatMap((child) => collectNotesInSubtree(child))];
}

/** Finds a folder anywhere in the tree by id, at any depth -- for
 * resolving a `?folder=` filter to the one folder whose *direct* notes
 * (not its descendants') the dashboard should show. */
export function findFolderNode<N extends { folder_id: string | null }>(
  roots: FolderNode<N>[],
  id: string
): FolderNode<N> | undefined {
  for (const node of roots) {
    if (node.id === id) return node;
    const found = findFolderNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}

/** Flat, indented list of folders for a "move to" picker, excluding a
 * folder and its own descendants (a folder can't be moved into itself). */
export function flattenForPicker<N extends { folder_id: string | null }>(roots: FolderNode<N>[], excludeSubtreeRootId?: string): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = [];

  function walk(nodes: FolderNode<N>[], depth: number, skip: boolean) {
    for (const node of nodes) {
      const skipThis = skip || node.id === excludeSubtreeRootId;
      if (!skipThis) {
        result.push({ id: node.id, label: `${"— ".repeat(depth)}${node.name}` });
      }
      walk(node.children, depth + 1, skipThis);
    }
  }

  walk(roots, 0, false);
  return result;
}
