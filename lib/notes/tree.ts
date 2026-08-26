import type { Database } from "@/lib/supabase/database.types";

type Folder = Database["public"]["Tables"]["folders"]["Row"];
type NoteSummary = Pick<Database["public"]["Tables"]["notes"]["Row"], "id" | "title" | "folder_id">;

export interface FolderNode extends Folder {
  children: FolderNode[];
  notes: NoteSummary[];
}

export function buildFolderTree(folders: Folder[], notes: NoteSummary[]) {
  const nodeById = new Map<string, FolderNode>();
  for (const folder of folders) {
    nodeById.set(folder.id, { ...folder, children: [], notes: [] });
  }

  const roots: FolderNode[] = [];
  for (const folder of folders) {
    const node = nodeById.get(folder.id)!;
    if (folder.parent_folder_id && nodeById.has(folder.parent_folder_id)) {
      nodeById.get(folder.parent_folder_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const rootNotes: NoteSummary[] = [];
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
export function countNotesInSubtree(node: FolderNode): number {
  return node.notes.length + node.children.reduce((sum, child) => sum + countNotesInSubtree(child), 0);
}

/** Flat, indented list of folders for a "move to" picker, excluding a
 * folder and its own descendants (a folder can't be moved into itself). */
export function flattenForPicker(roots: FolderNode[], excludeSubtreeRootId?: string): { id: string; label: string }[] {
  const result: { id: string; label: string }[] = [];

  function walk(nodes: FolderNode[], depth: number, skip: boolean) {
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
