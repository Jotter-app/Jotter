"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parseQuickAdd } from "@/lib/dates/parseQuickAdd";
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

  const { title, dueAt } = parseQuickAdd(parsed.data);
  if (!title) {
    return { error: "Enter a task." };
  }

  const { supabase, userId } = await currentUserId();
  if (!userId) {
    return { error: "Not signed in." };
  }

  const { error } = await supabase.from("tasks").insert({
    user_id: userId,
    title,
    due_at: dueAt ? dueAt.toISOString() : null,
  });
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/tasks");
  return { error: null };
}

export async function toggleTaskComplete(taskId: string, completed: boolean) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase
    .from("tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", taskId);

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
});

export async function updateTask(formData: FormData) {
  const parsed = updateTaskSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    priority: formData.get("priority"),
    dueAt: formData.get("dueAt") || undefined,
  });
  if (!parsed.success) return;

  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase
    .from("tasks")
    .update({
      title: parsed.data.title,
      priority: parsed.data.priority,
      due_at: parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null,
    })
    .eq("id", parsed.data.id);

  revalidatePath("/tasks");
}
