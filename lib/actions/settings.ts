"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import type { Database } from "@/lib/supabase/database.types";

// Core logic factored out (same seam as insertEventCore) so it's callable
// both from the request-scoped wrapper below and directly from the Jotter
// dispatcher/integration tests, neither of which can go through
// currentUserId() when there's no real Next.js request (e.g. a Vitest
// process) to read cookies() from.
export async function getDefaultEventCreatesTaskCore(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("default_event_creates_task")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.default_event_creates_task ?? false;
}

export async function getDefaultEventCreatesTask(): Promise<boolean> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return false;

  return getDefaultEventCreatesTaskCore(supabase, userId);
}

// Upsert rather than update -- accounts that signed up before the profiles
// trigger existed have no row yet, and this is how they get one.
export async function updateDefaultEventCreatesTask(value: boolean) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase
    .from("profiles")
    .upsert({ user_id: userId, default_event_creates_task: value }, { onConflict: "user_id" });

  revalidatePath("/settings");
}

export async function getHideNoteOnlyTagsCore(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("hide_note_only_tags_from_tasks")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.hide_note_only_tags_from_tasks ?? true;
}

export async function getHideNoteOnlyTags(): Promise<boolean> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return true;

  return getHideNoteOnlyTagsCore(supabase, userId);
}

export async function updateHideNoteOnlyTagsCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  value: boolean
) {
  await supabase
    .from("profiles")
    .upsert({ user_id: userId, hide_note_only_tags_from_tasks: value }, { onConflict: "user_id" });
}

export async function updateHideNoteOnlyTags(value: boolean) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await updateHideNoteOnlyTagsCore(supabase, userId, value);

  revalidatePath("/settings");
  revalidatePath("/tasks");
}
