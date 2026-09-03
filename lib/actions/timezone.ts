"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import type { Database } from "@/lib/supabase/database.types";

// Persists the viewer's detected IANA timezone to profiles.time_zone, so
// code with no request/cookie context to read (sync-calendars' background
// cron job) still has a real value instead of guessing. Fire-and-forget
// from TimeZoneProvider's effect, alongside the existing cookie write --
// this is a supplement to that cookie, not a replacement; every read
// inside a request still goes through getUserTimeZone()'s cookie read.
export async function updateUserTimeZoneCore(supabase: SupabaseClient<Database>, userId: string, timeZone: string) {
  await supabase.from("profiles").upsert({ user_id: userId, time_zone: timeZone }, { onConflict: "user_id" });
}

export async function updateUserTimeZone(timeZone: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await updateUserTimeZoneCore(supabase, userId, timeZone);
}
