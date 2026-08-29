"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseQuickAdd } from "@/lib/dates/parseQuickAdd";
import { extractAndStripTags } from "@/lib/markdown/extractTags";
import { findOrCreateTag } from "@/lib/tags/findOrCreateTag";
import { syncTaskReminder } from "@/lib/reminders/syncTaskReminder";
import { appendTaskCompletionJournalCore } from "@/lib/notes/appendTaskCompletionJournal";
import { currentUserId } from "@/lib/supabase/session";
import { getUserTimeZone } from "@/lib/dates/getUserTimeZone";
import type { Database } from "@/lib/supabase/database.types";

export interface QuickAddFormState {
  error: string | null;
}

export interface InsertTaskParams {
  title: string;
  dueAt: Date | null;
  tagNames: string[];
}

export interface InsertTaskResult {
  ok: boolean;
  taskId: string | null;
  error: string | null;
}

// Shared by the quick-add form action below and (eventually) the Jotter
// command dispatcher and event->task linking -- the actual insert + tag
// assignment + reminder sync belongs in exactly one place.
export async function insertTaskCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  { title, dueAt, tagNames }: InsertTaskParams
): Promise<InsertTaskResult> {
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title,
      due_at: dueAt ? dueAt.toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !task) {
    return { ok: false, taskId: null, error: error?.message ?? "Could not create task." };
  }

  for (const name of tagNames) {
    const tagId = await findOrCreateTag(supabase, userId, name);
    if (!tagId) continue;
    await supabase
      .from("taggables")
      .insert({ tag_id: tagId, user_id: userId, taggable_id: task.id, taggable_type: "task" });
  }

  if (dueAt) {
    await syncTaskReminder(supabase, userId, task.id, dueAt.toISOString());
  }

  return { ok: true, taskId: task.id, error: null };
}

export async function createTaskFromQuickAdd(
  _prevState: QuickAddFormState,
  formData: FormData
): Promise<QuickAddFormState> {
  const parsed = z.string().trim().min(1).safeParse(formData.get("text"));
  if (!parsed.success) {
    return { error: "Enter a task." };
  }

  const timeZone = await getUserTimeZone();
  const { title: titleWithTags, dueAt } = parseQuickAdd(parsed.data, new Date(), timeZone);
  if (!titleWithTags) {
    return { error: "Enter a task." };
  }

  // "#TagName1, #TagName2" anywhere in the text assigns those tags at
  // creation time and is stripped from the saved title.
  const { title, tags: tagNames } = extractAndStripTags(titleWithTags);
  if (!title) {
    return { error: "Enter a task." };
  }

  const { supabase, userId } = await currentUserId();
  if (!userId) {
    return { error: "Not signed in." };
  }

  const result = await insertTaskCore(supabase, userId, { title, dueAt, tagNames });
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/tasks");
  return { error: null };
}

export async function toggleTaskComplete(taskId: string, completed: boolean, dueAt: string | null) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  const updates: { completed_at: string | null; archived_at?: null } = {
    completed_at: completed ? new Date().toISOString() : null,
  };
  // Un-completing also un-archives -- "active but archived" isn't a state
  // that should be reachable, so unchecking an archived task's checkbox is
  // what moves it back to the normal active list in one step.
  if (!completed) updates.archived_at = null;

  const { data: updatedTask } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .select("title")
    .single();

  // Completing a task cancels its pending reminder (no point being told
  // about something already done); un-completing restores it if the task
  // still has a due date.
  await syncTaskReminder(supabase, userId, taskId, completed ? null : dueAt);

  // Every linked note gets a timestamped journal line -- a log, not a
  // synced summary, so re-completing after an uncheck appends again rather
  // than deduping.
  if (completed && updatedTask) {
    const touchedNoteIds = await appendTaskCompletionJournalCore(supabase, taskId, updatedTask.title);
    for (const noteId of touchedNoteIds) revalidatePath(`/notes/${noteId}`);
  }

  // Reachable from both the Tasks page and a calendar task chip.
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  revalidatePath("/notes");
}

export async function deleteTask(taskId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("tasks").delete().eq("id", taskId);
  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

export async function archiveTask(taskId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", taskId);
  revalidatePath("/tasks");
}

export async function unarchiveTask(taskId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("tasks").update({ archived_at: null }).eq("id", taskId);
  revalidatePath("/tasks");
}

// Clears the whole Completed section at once -- everything currently
// completed and not yet archived, for this user.
export async function archiveAllCompletedTasks() {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase
    .from("tasks")
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .is("archived_at", null);
  revalidatePath("/tasks");
}

const updateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1),
  priority: z.coerce.number().int().min(0).max(3),
  dueAt: z.string().optional(),
  expectedUpdatedAt: z.string(),
  force: z.coerce.boolean().optional(),
});

export interface UpdateTaskResult {
  ok: boolean;
  conflict: boolean;
  updatedAt: string | null;
}

/**
 * Same optimistic-concurrency check as notes' saveNote(): reject the write
 * if the row has moved on since the client loaded it (edited in another
 * tab), rather than silently overwriting a concurrent edit.
 */
export async function updateTask(formData: FormData): Promise<UpdateTaskResult> {
  const parsed = updateTaskSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    priority: formData.get("priority"),
    dueAt: formData.get("dueAt") || undefined,
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    force: formData.get("force") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, conflict: false, updatedAt: null };
  }

  const { supabase, userId } = await currentUserId();
  if (!userId) {
    return { ok: false, conflict: false, updatedAt: null };
  }

  const { data: current } = await supabase
    .from("tasks")
    .select("updated_at")
    .eq("id", parsed.data.id)
    .single();

  if (!parsed.data.force && current && current.updated_at !== parsed.data.expectedUpdatedAt) {
    return { ok: false, conflict: true, updatedAt: current.updated_at };
  }

  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null;

  const { data: updated, error } = await supabase
    .from("tasks")
    .update({
      title: parsed.data.title,
      priority: parsed.data.priority,
      due_at: dueAt,
    })
    .eq("id", parsed.data.id)
    .select("updated_at")
    .single();
  if (error || !updated) {
    return { ok: false, conflict: false, updatedAt: null };
  }

  await syncTaskReminder(supabase, userId, parsed.data.id, dueAt);

  revalidatePath("/tasks");
  revalidatePath("/calendar");
  return { ok: true, conflict: false, updatedAt: updated.updated_at };
}
