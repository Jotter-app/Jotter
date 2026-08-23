"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parseQuickAdd } from "@/lib/dates/parseQuickAdd";
import { extractAndStripTags } from "@/lib/markdown/extractTags";
import { findOrCreateTag } from "@/lib/tags/findOrCreateTag";
import { syncTaskReminder } from "@/lib/reminders/syncTaskReminder";
import { currentUserId } from "@/lib/supabase/session";

export interface QuickAddFormState {
  error: string | null;
}

export async function createTaskFromQuickAdd(
  _prevState: QuickAddFormState,
  formData: FormData
): Promise<QuickAddFormState> {
  const parsed = z.string().trim().min(1).safeParse(formData.get("text"));
  if (!parsed.success) {
    return { error: "Enter a task." };
  }

  const { title: titleWithTags, dueAt } = parseQuickAdd(parsed.data);
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
    return { error: error?.message ?? "Could not create task." };
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

  revalidatePath("/tasks");
  return { error: null };
}

export async function toggleTaskComplete(taskId: string, completed: boolean, dueAt: string | null) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase
    .from("tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", taskId);

  // Completing a task cancels its pending reminder (no point being told
  // about something already done); un-completing restores it if the task
  // still has a due date.
  await syncTaskReminder(supabase, userId, taskId, completed ? null : dueAt);

  revalidatePath("/tasks");
}

export async function deleteTask(taskId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("tasks").delete().eq("id", taskId);
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
  return { ok: true, conflict: false, updatedAt: updated.updated_at };
}
