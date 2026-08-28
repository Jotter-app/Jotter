"use server";

import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/supabase/session";
import { findOrCreateTag } from "@/lib/tags/findOrCreateTag";

export type TaggableType = "task" | "note" | "event";

function pathFor(taggableType: TaggableType) {
  if (taggableType === "task") return "/tasks";
  if (taggableType === "event") return "/calendar";
  return "/notes";
}

export async function createAndAssignTag(
  name: string,
  taggableId: string,
  taggableType: TaggableType
) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  const tagId = await findOrCreateTag(supabase, userId, name);
  if (!tagId) return;

  await supabase
    .from("taggables")
    .insert({ tag_id: tagId, user_id: userId, taggable_id: taggableId, taggable_type: taggableType });

  revalidatePath(pathFor(taggableType));
}

export async function assignExistingTag(
  tagId: string,
  taggableId: string,
  taggableType: TaggableType
) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase
    .from("taggables")
    .insert({ tag_id: tagId, user_id: userId, taggable_id: taggableId, taggable_type: taggableType });

  revalidatePath(pathFor(taggableType));
}

export async function unassignTag(
  tagId: string,
  taggableId: string,
  taggableType: TaggableType
) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase
    .from("taggables")
    .delete()
    .eq("tag_id", tagId)
    .eq("taggable_id", taggableId)
    .eq("taggable_type", taggableType);

  revalidatePath(pathFor(taggableType));
}

/**
 * Deletes the tag itself (not just one assignment) -- removes it from
 * every task and note that has it, via the taggables FK's ON DELETE
 * CASCADE. This is what "delete from the filter list" means, as opposed
 * to unassignTag's "remove this one tag from this one item."
 */
export async function deleteTagGlobally(tagId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("tags").delete().eq("id", tagId);

  revalidatePath("/tasks");
  revalidatePath("/notes");
  revalidatePath("/calendar");
}
