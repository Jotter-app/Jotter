"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import { getUserTimeZone } from "@/lib/dates/getUserTimeZone";
import { insertTaskCore } from "@/lib/actions/tasks";
import { parseQuickAdd } from "@/lib/dates/parseQuickAdd";
import { extractAndStripTags } from "@/lib/markdown/extractTags";
import { formatTaskCheckboxLine } from "@/lib/jotter/formatTaskCheckboxLine";
import type { Database } from "@/lib/supabase/database.types";

// Core logic factored out (same seam as insertEventCore) so it's callable
// both from the request-scoped actions below and directly from integration
// tests, which can't go through currentUserId() -- it depends on
// next/headers' cookies(), which only works inside an actual Next.js
// request.
export async function linkTaskNoteCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  taskId: string,
  noteId: string
) {
  // upsert + ignoreDuplicates: task_note_links has a unique(task_id, note_id)
  // constraint -- linking an already-linked pair is a no-op, not an error.
  await supabase
    .from("task_note_links")
    .upsert(
      { user_id: userId, task_id: taskId, note_id: noteId },
      { onConflict: "task_id,note_id", ignoreDuplicates: true }
    );
}

export async function unlinkTaskNoteCore(supabase: SupabaseClient<Database>, taskId: string, noteId: string) {
  await supabase.from("task_note_links").delete().eq("task_id", taskId).eq("note_id", noteId);
}

export async function linkTaskNote(taskId: string, noteId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await linkTaskNoteCore(supabase, userId, taskId, noteId);

  revalidatePath("/tasks");
  revalidatePath(`/notes/${noteId}`);
}

export async function unlinkTaskNote(taskId: string, noteId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await unlinkTaskNoteCore(supabase, taskId, noteId);

  revalidatePath("/tasks");
  revalidatePath(`/notes/${noteId}`);
}

// Powers the note editor's "create linked task from this line" toolbar
// button. Reuses parseQuickAdd/extractAndStripTags -- the same pair
// parseImplicit.ts uses for freeform text -- so a line like "Call the
// dentist tomorrow 5pm #health" picks up the due date and tag instead of
// keeping them as literal title text. Returns the formatted checkbox line
// so the caller can splice it into the editor in place of the raw line.
export async function createTaskFromNoteLineCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  noteId: string,
  lineText: string,
  timeZone?: string
): Promise<{ ok: boolean; replacementLine: string | null }> {
  const trimmed = lineText.trim();
  if (!trimmed) return { ok: false, replacementLine: null };

  const { title: titleWithTags, dueAt } = parseQuickAdd(trimmed, new Date(), timeZone);
  const { title, tags } = extractAndStripTags(titleWithTags);
  if (!title) return { ok: false, replacementLine: null };

  const result = await insertTaskCore(supabase, userId, { title, dueAt, tagNames: tags });
  if (!result.ok || !result.taskId) return { ok: false, replacementLine: null };

  await linkTaskNoteCore(supabase, userId, result.taskId, noteId);
  return { ok: true, replacementLine: formatTaskCheckboxLine(result.taskId, title, dueAt, tags) };
}

export async function createTaskFromNoteLine(noteId: string, lineText: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, replacementLine: null };

  const timeZone = await getUserTimeZone();
  const result = await createTaskFromNoteLineCore(supabase, userId, noteId, lineText, timeZone);

  if (result.ok) {
    revalidatePath("/tasks");
    revalidatePath("/calendar");
  }
  return result;
}
