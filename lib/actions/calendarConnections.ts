"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import type { Database } from "@/lib/supabase/database.types";

type CalendarConnection = Database["public"]["Tables"]["calendar_connections"]["Row"];

// Core logic factored out (same seam as insertEventCore/getDefaultEventCreatesTaskCore)
// so it's callable directly from integration tests, which can't go through
// currentUserId() outside a real Next.js request.
export async function getGoogleCalendarConnectionCore(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<CalendarConnection | null> {
  const { data } = await supabase
    .from("calendar_connections")
    .select()
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  return data ?? null;
}

export async function getGoogleCalendarConnection(): Promise<CalendarConnection | null> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return null;

  return getGoogleCalendarConnectionCore(supabase, userId);
}

export async function disconnectGoogleCalendarCore(supabase: SupabaseClient<Database>, userId: string) {
  // Deleting the row cascades via events.calendar_connection_id's
  // `on delete set null` -- every previously-synced event survives as an
  // ordinary standalone Jotter event, nothing bulk-deleted.
  await supabase.from("calendar_connections").delete().eq("user_id", userId).eq("provider", "google");
}

export async function disconnectGoogleCalendar() {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await disconnectGoogleCalendarCore(supabase, userId);

  revalidatePath("/settings");
  revalidatePath("/calendar");
}

export async function triggerSyncNowCore(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ ok: boolean; error: string | null }> {
  const connection = await getGoogleCalendarConnectionCore(supabase, userId);
  if (!connection) return { ok: false, error: "No connected calendar." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { ok: false, error: "Supabase URL is not configured." };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/sync-calendars?connectionId=${connection.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return { ok: false, error: `Sync failed: ${await res.text()}` };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sync failed." };
  }
}

export async function triggerSyncNow() {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, error: "Not signed in." };

  const result = await triggerSyncNowCore(supabase, userId);

  revalidatePath("/settings");
  revalidatePath("/calendar");
  return result;
}
