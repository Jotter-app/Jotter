"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/supabase/session";

const eventSchema = z.object({
  title: z.string().trim().min(1),
  startAt: z.string(),
  endAt: z.string(),
  calendarColor: z.string().default("#3b82f6"),
});

export interface EventFormState {
  error: string | null;
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

  const { error } = await supabase.from("events").insert({
    user_id: userId,
    title: parsed.data.title,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    calendar_color: parsed.data.calendarColor,
  });
  if (error) return { error: error.message };

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
