"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import type { Database } from "@/lib/supabase/database.types";

const eventSchema = z.object({
  title: z.string().trim().min(1),
  startAt: z.string(),
  endAt: z.string(),
  calendarColor: z.string().default("#3b82f6"),
});

export interface EventFormState {
  error: string | null;
}

export interface InsertEventParams {
  title: string;
  startAt: string;
  endAt: string;
  calendarColor?: string;
}

export interface InsertEventResult {
  ok: boolean;
  eventId: string | null;
  error: string | null;
}

// Shared by the form action below and (eventually) the Jotter command
// dispatcher -- the actual event insert belongs in exactly one place.
export async function insertEventCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  { title, startAt, endAt, calendarColor = "#3b82f6" }: InsertEventParams
): Promise<InsertEventResult> {
  const { data: event, error } = await supabase
    .from("events")
    .insert({
      user_id: userId,
      title,
      start_at: startAt,
      end_at: endAt,
      calendar_color: calendarColor,
    })
    .select("id")
    .single();
  if (error || !event) {
    return { ok: false, eventId: null, error: error?.message ?? "Could not create event." };
  }

  return { ok: true, eventId: event.id, error: null };
}

export async function createEvent(
  _prevState: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const parsed = eventSchema.safeParse({
    title: formData.get("title"),
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    calendarColor: formData.get("calendarColor") || undefined,
  });
  if (!parsed.success) {
    return { error: "Title, start, and end are required." };
  }

  const startAt = new Date(parsed.data.startAt);
  const endAt = new Date(parsed.data.endAt);
  if (endAt < startAt) {
    return { error: "End time must be after the start time." };
  }

  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "Not signed in." };

  const result = await insertEventCore(supabase, userId, {
    title: parsed.data.title,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    calendarColor: parsed.data.calendarColor,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/calendar");
  return { error: null };
}

export async function rescheduleEvent(eventId: string, newStartAt: string, newEndAt: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase
    .from("events")
    .update({ start_at: newStartAt, end_at: newEndAt })
    .eq("id", eventId);

  revalidatePath("/calendar");
}

export async function deleteEvent(eventId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await supabase.from("events").delete().eq("id", eventId);
  revalidatePath("/calendar");
}
