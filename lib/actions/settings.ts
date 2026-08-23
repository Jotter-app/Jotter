"use server";

import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/supabase/session";

export async function getDefaultEventCreatesTask(): Promise<boolean> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return false;

  const { data } = await supabase
    .from("profiles")
    .select("default_event_creates_task")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.default_event_creates_task ?? false;
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
