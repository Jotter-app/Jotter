"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/supabase/session";
import { extractTags } from "@/lib/markdown/extractTags";
import { findOrCreateTag } from "@/lib/tags/findOrCreateTag";

export async function createNote(folderId: string | null) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  const { data, error } = await supabase
    .from("notes")
    .insert({ user_id: userId, folder_id: folderId, title: "Untitled", body_markdown: "" })
    .select("id")
    .single();
  if (error || !data) return;

  revalidatePath("/notes");
  redirect(`/notes/${data.id}`);
}

export async function deleteNote(noteId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("notes").delete().eq("id", noteId);
  revalidatePath("/notes");
}

export async function moveNote(noteId: string, folderId: string | null) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("notes").update({ folder_id: folderId }).eq("id", noteId);
  revalidatePath("/notes");
}

export interface SaveNoteResult {
  ok: boolean;
  conflict: boolean;
  updatedAt: string | null;
}

/**
 * Optimistic concurrency check: the client sends the updated_at it loaded
 * the note with. If the row has moved on since (edited in another tab),
 * the write is rejected with conflict: true instead of silently
 * overwriting -- the editor then asks the user to confirm before retrying
 * with force: true.
 */
export async function saveNote(
  noteId: string,
  title: string,
  bodyMarkdown: string,
  expectedUpdatedAt: string,
  force = false
): Promise<SaveNoteResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, conflict: false, updatedAt: null };

  const { data: current } = await supabase
    .from("notes")
    .select("updated_at")
    .eq("id", noteId)
    .single();

  if (!force && current && current.updated_at !== expectedUpdatedAt) {
    return { ok: false, conflict: true, updatedAt: current.updated_at };
  }

  const { data: updated, error } = await supabase
    .from("notes")
    .update({ title, body_markdown: bodyMarkdown })
    .eq("id", noteId)
    .select("updated_at")
    .single();
  if (error || !updated) {
    return { ok: false, conflict: false, updatedAt: null };
  }

  // Hashtags only ever add tags, never remove them on save -- a tag
  // manually assigned via the picker (or a hashtag the user later deletes
  // from the text) should not silently disappear.
  const tagNames = extractTags(bodyMarkdown);
  for (const name of tagNames) {
    const tagId = await findOrCreateTag(supabase, userId, name);
    if (!tagId) continue;

    await supabase
      .from("taggables")
      .upsert(
        { tag_id: tagId, user_id: userId, taggable_id: noteId, taggable_type: "note" },
        { onConflict: "tag_id,taggable_id,taggable_type", ignoreDuplicates: true }
      );
  }

  revalidatePath("/notes");
  return { ok: true, conflict: false, updatedAt: updated.updated_at };
}
