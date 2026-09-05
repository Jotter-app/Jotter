"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import type { Database } from "@/lib/supabase/database.types";

// Core logic factored out (same seam as createProjectCore) so it's callable
// directly from integration tests, which can't go through currentUserId().
export async function createSectionCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  projectId: string,
  name: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("sections")
    .insert({ user_id: userId, project_id: projectId, name })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

export async function createSection(projectId: string, name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { supabase, userId } = await currentUserId();
  if (!userId) return null;

  const sectionId = await createSectionCore(supabase, userId, projectId, trimmed);
  if (sectionId) revalidatePath(`/projects/${projectId}`);
  return sectionId;
}

export async function renameSectionCore(supabase: SupabaseClient<Database>, sectionId: string, name: string) {
  await supabase.from("sections").update({ name }).eq("id", sectionId);
}

export async function renameSection(sectionId: string, projectId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await renameSectionCore(supabase, sectionId, trimmed);
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Deleting a non-empty section always asks the user to choose (same "never
 * silently orphan or destroy without an explicit choice" rule as
 * deleteProjectCore):
 * - deleteTasks: false (default) -- delete only the section row. Every task
 *   that pointed at it becomes unfiled (back to "No Section") via the
 *   schema's own `on delete set null`, not a manual update here.
 * - deleteTasks: true -- delete every task filed under this section first,
 *   then the section row.
 */
export async function deleteSectionCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  sectionId: string,
  deleteTasks: boolean
) {
  if (deleteTasks) {
    await supabase.from("tasks").delete().eq("user_id", userId).eq("section_id", sectionId);
  }

  await supabase.from("sections").delete().eq("id", sectionId);
}

export async function deleteSection(sectionId: string, projectId: string, deleteTasks: boolean) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await deleteSectionCore(supabase, userId, sectionId, deleteTasks);

  // Unlike deleting a whole project, deleting one of its sections doesn't
  // navigate the user anywhere -- they stay on the same board, so it must
  // revalidate in place.
  revalidatePath(`/projects/${projectId}`);
}

export async function assignTaskSectionCore(
  supabase: SupabaseClient<Database>,
  taskId: string,
  sectionId: string | null
) {
  await supabase.from("tasks").update({ section_id: sectionId }).eq("id", taskId);
}

// Takes projectId (unlike assignTaskProject's simpler 2-arg form) so it can
// revalidate the exact board page -- this is the hot path for
// drag-and-drop, so it shouldn't depend on a broader/less certain
// revalidation to reflect the move.
export async function assignTaskSection(taskId: string, sectionId: string | null, projectId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await assignTaskSectionCore(supabase, taskId, sectionId);
  revalidatePath(`/projects/${projectId}`);
}
