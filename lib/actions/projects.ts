"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import type { Database } from "@/lib/supabase/database.types";

// Core logic factored out (same seam as createFolderCore) so it's callable
// directly from integration tests, which can't go through currentUserId().
export async function createProjectCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  name: string
): Promise<string | null> {
  const { data, error } = await supabase.from("projects").insert({ user_id: userId, name }).select("id").single();
  if (error || !data) return null;
  return data.id;
}

export async function createProject(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { supabase, userId } = await currentUserId();
  if (!userId) return null;

  const projectId = await createProjectCore(supabase, userId, trimmed);
  if (projectId) revalidatePath("/projects");
  return projectId;
}

export async function renameProjectCore(supabase: SupabaseClient<Database>, projectId: string, name: string) {
  await supabase.from("projects").update({ name }).eq("id", projectId);
}

export async function renameProject(projectId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await renameProjectCore(supabase, projectId, trimmed);
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Deleting a non-empty project always asks the user to choose (same
 * "never silently orphan or destroy without an explicit choice" rule as
 * deleteFolderCore):
 * - deleteTasks: false (default) -- delete only the project row. Every
 *   task that pointed at it becomes unfiled via the schema's own
 *   `on delete set null`, not a manual update here.
 * - deleteTasks: true -- delete every task filed under this project
 *   first, then the project row.
 * No "move to" option (unlike folders): projects are flat, so there's no
 * parent to move orphaned tasks up into.
 */
export async function deleteProjectCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  projectId: string,
  deleteTasks: boolean
) {
  if (deleteTasks) {
    await supabase.from("tasks").delete().eq("user_id", userId).eq("project_id", projectId);
  }

  await supabase.from("projects").delete().eq("id", projectId);
}

export async function deleteProject(projectId: string, deleteTasks: boolean) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await deleteProjectCore(supabase, userId, projectId, deleteTasks);

  revalidatePath("/projects");
  revalidatePath("/tasks");
}

export async function assignTaskProjectCore(
  supabase: SupabaseClient<Database>,
  taskId: string,
  projectId: string | null
) {
  await supabase.from("tasks").update({ project_id: projectId }).eq("id", taskId);
}

export async function assignTaskProject(taskId: string, projectId: string | null) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await assignTaskProjectCore(supabase, taskId, projectId);
  revalidatePath("/tasks");
  revalidatePath("/projects");
}
