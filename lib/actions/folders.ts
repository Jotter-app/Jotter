"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/supabase/session";

export async function createFolder(name: string, parentFolderId: string | null) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("folders").insert({
    user_id: userId,
    name: trimmed,
    parent_folder_id: parentFolderId,
  });

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
  mode: z.enum(["cascade", "move-to-parent"]),
});

/**
 * Deleting a non-empty folder always asks the user to choose:
 * - "cascade": delete this folder and its entire sub-folder tree. Notes are
 *   never destroyed as a side effect (notes.folder_id is ON DELETE SET
 *   NULL, not CASCADE) -- any note anywhere in the deleted subtree survives
 *   as unfiled (root-level). This flattens the whole subtree in one step.
 * - "move-to-parent": re-parent only the folder's *direct* child folders
 *   and notes up one level, then delete the now-empty folder. Deeper
 *   nesting below those children is preserved untouched.
 * Either way, notes are never silently orphaned without an explicit choice
 * (per the design spec's error-handling requirement).
 */
export async function deleteFolder(input: z.infer<typeof deleteFolderSchema>) {
  const parsed = deleteFolderSchema.safeParse(input);
  if (!parsed.success) return;
  const { folderId, mode } = parsed.data;

  const { supabase, userId } = await currentUserId();
  if (!userId) return;

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
  // "cascade": no manual cleanup needed -- deleting the folder below lets
  // Postgres cascade through the entire sub-folder tree via the FK, and
  // ON DELETE SET NULL fires per-row for any note in any deleted folder.

  await supabase.from("folders").delete().eq("id", folderId);
  revalidatePath("/notes");
}
