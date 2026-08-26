"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractWikilinkTitles, resolveWikilinkTitle } from "@/lib/notes/resolveWikilink";
import { diffNoteLinks } from "@/lib/notes/syncNoteLinks";
import type { Database } from "@/lib/supabase/database.types";

// Makes note_links for `noteId` match exactly what body's [[wikilinks]]
// resolve to. Deliberately different from how #tags behave on save (which
// only ever add): tags are also manually assignable via the tag picker, but
// wikilinks have no separate assignment UI, so the text is the only source
// of truth for what a note links to -- see the design spec's Data Model
// section. An unresolvable title is simply left out of the desired set;
// nothing gets written for it. Core/wrapper split (same seam as
// linkTaskNoteCore) so integration tests can call this directly without
// going through currentUserId(), which depends on next/headers' cookies().
export async function syncNoteLinksCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  noteId: string,
  body: string
) {
  // Explicit .eq("user_id", userId) alongside RLS, matching this repo's
  // established defense-in-depth convention for core functions.
  const { data: candidates } = await supabase.from("notes").select("id, title, updated_at").eq("user_id", userId);

  const desiredIds = extractWikilinkTitles(body)
    .map((title) => resolveWikilinkTitle(title, candidates ?? [])?.id)
    .filter((id): id is string => id !== undefined);

  const { data: existing } = await supabase
    .from("note_links")
    .select("target_note_id")
    .eq("source_note_id", noteId);
  const existingIds = (existing ?? []).map((row) => row.target_note_id);

  // Case-insensitive resolution means two differently-cased titles in the
  // body (e.g. "[[foo]]" and "[[FOO]]") can resolve to the same note id --
  // dedupe before diffing so that isn't mistaken for a change.
  const { toAdd, toRemove } = diffNoteLinks(existingIds, [...new Set(desiredIds)]);

  if (toRemove.length > 0) {
    await supabase.from("note_links").delete().eq("source_note_id", noteId).in("target_note_id", toRemove);
  }

  for (const targetNoteId of toAdd) {
    await supabase
      .from("note_links")
      .upsert(
        { user_id: userId, source_note_id: noteId, target_note_id: targetNoteId },
        { onConflict: "source_note_id,target_note_id", ignoreDuplicates: true }
      );
  }
}
