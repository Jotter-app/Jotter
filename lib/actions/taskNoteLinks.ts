"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
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
