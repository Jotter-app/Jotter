"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import type { Database } from "@/lib/supabase/database.types";

// Core logic factored out (same seam as deleteFolderCore) so it's callable
// directly from import's folder-path resolution and from integration
// tests, neither of which can go through currentUserId().
export async function createFolderCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  { name, parentFolderId }: { name: string; parentFolderId: string | null }
): Promise<string | null> {
  const { data, error } = await supabase
    .from("folders")
    .insert({ user_id: userId, name, parent_folder_id: parentFolderId })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

export async function createFolder(name: string, parentFolderId: string | null) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await createFolderCore(supabase, userId, { name: trimmed, parentFolderId });

  revalidatePath("/notes");
}

export async function renameFolder(folderId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("folders").update({ name: trimmed }).eq("id", folderId);
  revalidatePath("/notes");
}

export async function moveFolder(folderId: string, newParentFolderId: string | null) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("folders").update({ parent_folder_id: newParentFolderId }).eq("id", folderId);
  revalidatePath("/notes");
}

const deleteFolderSchema = z.object({
  folderId: z.string().uuid(),
  mode: z.enum(["cascade", "move-to-parent", "cascade-delete-notes"]),
});

export type DeleteFolderMode = z.infer<typeof deleteFolderSchema>["mode"];

/** Every folder id in the subtree rooted at rootFolderId (itself included),
 * via an application-level BFS rather than a recursive SQL query -- folders
 * can nest arbitrarily, so a plain `.eq("folder_id", rootFolderId)` on
 * notes would only ever catch direct children, missing anything in a
 * grandchild folder or deeper. */
async function collectDescendantFolderIds(
  supabase: SupabaseClient<Database>,
  userId: string,
  rootFolderId: string
): Promise<string[]> {
  const { data: allFolders } = await supabase
    .from("folders")
    .select("id, parent_folder_id")
    .eq("user_id", userId);

  const childrenByParent = new Map<string, string[]>();
  for (const folder of allFolders ?? []) {
    if (!folder.parent_folder_id) continue;
    const existing = childrenByParent.get(folder.parent_folder_id) ?? [];
    existing.push(folder.id);
    childrenByParent.set(folder.parent_folder_id, existing);
  }

  const ids = [rootFolderId];
  const queue = [rootFolderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const childId of childrenByParent.get(current) ?? []) {
      ids.push(childId);
      queue.push(childId);
    }
  }
  return ids;
}

/**
 * Core logic factored out (same seam as insertEventCore) so it's callable
 * both from the request-scoped action below and directly from integration
 * tests, which can't go through currentUserId() -- it depends on
 * next/headers' cookies(), which only works inside an actual Next.js
 * request.
 *
 * Deleting a non-empty folder always asks the user to choose:
 * - "cascade": delete this folder and its entire sub-folder tree. Notes are
 *   never destroyed as a side effect (notes.folder_id is ON DELETE SET
 *   NULL, not CASCADE) -- any note anywhere in the deleted subtree survives
 *   as unfiled (root-level). This flattens the whole subtree in one step.
 * - "cascade-delete-notes": same subtree deletion, but every note anywhere
 *   in that subtree is deleted too rather than unfiled -- the "also delete
 *   the notes" option, kept as an explicit separate choice from plain
 *   "cascade" rather than changing what that already-established option
 *   does.
 * - "move-to-parent": re-parent only the folder's *direct* child folders
 *   and notes up one level, then delete the now-empty folder. Deeper
 *   nesting below those children is preserved untouched.
 * Either way, notes are never silently orphaned or destroyed without an
 * explicit choice (per the design spec's error-handling requirement).
 */
export async function deleteFolderCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  { folderId, mode }: { folderId: string; mode: DeleteFolderMode }
) {
  if (mode === "move-to-parent") {
    const { data: folder } = await supabase
      .from("folders")
      .select("parent_folder_id")
      .eq("id", folderId)
      .single();
    const parentId = folder?.parent_folder_id ?? null;

    await supabase.from("folders").update({ parent_folder_id: parentId }).eq("parent_folder_id", folderId);
    await supabase.from("notes").update({ folder_id: parentId }).eq("folder_id", folderId);
  }

  if (mode === "cascade-delete-notes") {
    const folderIds = await collectDescendantFolderIds(supabase, userId, folderId);
    await supabase.from("notes").delete().in("folder_id", folderIds);
  }
  // "cascade": no manual cleanup needed -- deleting the folder below lets
  // Postgres cascade through the entire sub-folder tree via the FK, and
  // ON DELETE SET NULL fires per-row for any note in any deleted folder.

  await supabase.from("folders").delete().eq("id", folderId);
}

export async function deleteFolder(input: z.infer<typeof deleteFolderSchema>) {
  const parsed = deleteFolderSchema.safeParse(input);
  if (!parsed.success) return;

  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await deleteFolderCore(supabase, userId, parsed.data);
  revalidatePath("/notes");
}
