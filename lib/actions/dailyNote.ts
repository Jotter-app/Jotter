"use server";

import { format } from "date-fns";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import { insertNoteCore } from "@/lib/actions/notes";
import { getOrCreateFolderByName } from "@/lib/notes/getOrCreateFolderByName";
import type { Database } from "@/lib/supabase/database.types";

const DAILY_NOTES_FOLDER = "Daily Notes";

// Core logic factored out (same seam as insertEventCore) so it's callable
// directly from integration tests, which can't go through currentUserId().
// Idempotent by exact title match within the Daily Notes folder -- revisiting
// the same day opens the existing note (with whatever the user has already
// written) rather than re-templating over it.
export async function getOrCreateDailyNoteCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  date: Date
): Promise<string | null> {
  const folderId = await getOrCreateFolderByName(supabase, userId, DAILY_NOTES_FOLDER);
  if (!folderId) return null;

  const title = format(date, "EEEE, MMM d, yyyy");
  const { data: existing } = await supabase.from("notes").select("id").eq("folder_id", folderId).eq("title", title).maybeSingle();
  if (existing) return existing.id;

  // Live embedded queries (Tier 2/3), not a one-off static pull -- today's
  // tasks/events stay current as the day goes on, e.g. completing a task
  // drops it out of the list on next load.
  const bodyMarkdown = "## Tasks due today\n?tasks due:today\n\n## Today's events\n?events due:today\n\n## Journal\n\n";
  const result = await insertNoteCore(supabase, userId, { folderId, title, bodyMarkdown });
  return result.noteId;
}

export async function openTodaysDailyNote() {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  const noteId = await getOrCreateDailyNoteCore(supabase, userId, new Date());
  if (noteId) redirect(`/notes/${noteId}`);
}
