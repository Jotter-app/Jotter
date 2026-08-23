"use server";

import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/supabase/session";

export type TaggableType = "task" | "note";

function pathFor(taggableType: TaggableType) {
  return taggableType === "task" ? "/tasks" : "/notes";
}

export async function createAndAssignTag(
  name: string,
  taggableId: string,
  taggableType: TaggableType
) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  const { data: existing } = await supabase
    .from("tags")
    .select("id")
    .eq("name", trimmed)
    .maybeSingle();

  let tagId = existing?.id;
  if (!tagId) {
    const { data: created, error } = await supabase
      .from("tags")
      .insert({ user_id: userId, name: trimmed })
      .select("id")
      .single();
    if (error || !created) return;
    tagId = created.id;
  }

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
