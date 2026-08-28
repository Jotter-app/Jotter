"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import { extractTags } from "@/lib/markdown/extractTags";
import { findOrCreateTag } from "@/lib/tags/findOrCreateTag";
import { processNoteTaskCommands } from "@/lib/jotter/processNoteCommands";
import { syncNoteLinksCore } from "@/lib/actions/noteLinks";
import type { Database } from "@/lib/supabase/database.types";

export interface InsertNoteParams {
  folderId: string | null;
  title: string;
  bodyMarkdown: string;
  // Only set by note import, to restore a note's original timestamps from
  // its exported frontmatter -- every other caller omits these and gets
  // the table's own now() defaults. Safe to pass through on insert (unlike
  // an update) since notes_set_updated_at is a `before update` trigger,
  // not `before insert`.
  createdAt?: string;
  updatedAt?: string;
}

export interface InsertNoteResult {
  ok: boolean;
  noteId: string | null;
  error: string | null;
}

// Shared by createNote below and (eventually) the Jotter command
// dispatcher -- the actual note insert belongs in exactly one place.
export async function insertNoteCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  { folderId, title, bodyMarkdown, createdAt, updatedAt }: InsertNoteParams
): Promise<InsertNoteResult> {
  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: userId,
      folder_id: folderId,
      title,
      body_markdown: bodyMarkdown,
      ...(createdAt ? { created_at: createdAt } : {}),
      ...(updatedAt ? { updated_at: updatedAt } : {}),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, noteId: null, error: error?.message ?? "Could not create note." };
  }
  return { ok: true, noteId: data.id, error: null };
}

export async function createNote(folderId: string | null) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  const result = await insertNoteCore(supabase, userId, { folderId, title: "Untitled", bodyMarkdown: "" });
  if (!result.ok || !result.noteId) return;

  revalidatePath("/notes");
  redirect(`/notes/${result.noteId}`);
}

// Unlike createNote, this returns the result instead of redirect()-ing --
// the caller is a click handler on a broken-wikilink widget that needs to
// await the id and navigate itself.
export async function createNoteFromWikilink(title: string): Promise<InsertNoteResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, noteId: null, error: "Not signed in." };

  const result = await insertNoteCore(supabase, userId, { folderId: null, title, bodyMarkdown: "" });
  if (result.ok) revalidatePath("/notes");
  return result;
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

export async function setNoteStarred(noteId: string, starred: boolean) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("notes").update({ starred }).eq("id", noteId);
  revalidatePath("/notes");
  revalidatePath(`/notes/${noteId}`);
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

  // Turns any "/task create ..." lines into linked tasks and replaces them
  // with a plain checkbox -- see lib/jotter/processNoteCommands.ts. A no-op
  // (returns bodyMarkdown unchanged) when there's nothing to process, which
  // is the common case on every ordinary save.
  const processedBody = await processNoteTaskCommands(supabase, userId, noteId, bodyMarkdown);

  const { data: updated, error } = await supabase
    .from("notes")
    .update({ title, body_markdown: processedBody })
    .eq("id", noteId)
    .select("updated_at")
    .single();
  if (error || !updated) {
    return { ok: false, conflict: false, updatedAt: null };
  }

  // Exact sync (unlike tags below, which only ever add) -- wikilinks have
  // no separate assignment UI, so the text is the only source of truth for
  // what a note links to.
  await syncNoteLinksCore(supabase, userId, noteId, processedBody);

  // Hashtags only ever add tags, never remove them on save -- a tag
  // manually assigned via the picker (or a hashtag the user later deletes
  // from the text) should not silently disappear.
  const tagNames = extractTags(processedBody);
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
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  return { ok: true, conflict: false, updatedAt: updated.updated_at };
}
