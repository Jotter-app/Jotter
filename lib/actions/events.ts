"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import { insertTaskCore } from "@/lib/actions/tasks";
import { syncTaskReminder } from "@/lib/reminders/syncTaskReminder";
import type { Database } from "@/lib/supabase/database.types";

const eventSchema = z.object({
  title: z.string().trim().min(1),
  startAt: z.string(),
  endAt: z.string(),
  calendarColor: z.string().default("#7a8a5e"),
  alsoCreateTask: z.string().optional(),
});

export interface EventFormState {
  error: string | null;
}

export interface InsertEventParams {
  title: string;
  startAt: string;
  endAt: string;
  calendarColor?: string;
  alsoCreateTask?: boolean;
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
  { title, startAt, endAt, calendarColor = "#7a8a5e", alsoCreateTask = false }: InsertEventParams
): Promise<InsertEventResult> {
  // A companion-task creation failure should never block the event itself
  // from being created -- same never-block-submission principle used
  // elsewhere in this codebase (e.g. quick-add's date parsing).
  let linkedTaskId: string | null = null;
  if (alsoCreateTask) {
    const taskResult = await insertTaskCore(supabase, userId, {
      title,
      dueAt: new Date(startAt),
      tagNames: [],
    });
    linkedTaskId = taskResult.taskId;
  }

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      user_id: userId,
      title,
      start_at: startAt,
      end_at: endAt,
      calendar_color: calendarColor,
      linked_task_id: linkedTaskId,
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
    alsoCreateTask: formData.get("alsoCreateTask") || undefined,
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
    // Native checkbox semantics: present ("on") when checked, absent from
    // FormData entirely when unchecked.
    alsoCreateTask: parsed.data.alsoCreateTask === "on",
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/calendar");
  revalidatePath("/tasks");
  return { error: null };
}

// Core logic factored out (same seam as insertEventCore) so it's callable
// both from the request-scoped action below and directly from integration
// tests, which can't go through currentUserId() -- it depends on
// next/headers' cookies(), which only works inside an actual Next.js
// request.
export async function rescheduleEventCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  newStartAt: string,
  newEndAt: string
) {
  const { data: before } = await supabase
    .from("events")
    .select("start_at, linked_task_id")
    .eq("id", eventId)
    .single();

  await supabase.from("events").update({ start_at: newStartAt, end_at: newEndAt }).eq("id", eventId);

  // Keep the linked task's due date (and therefore its reminder) moving
  // with the event -- same delta the event itself just shifted by.
  if (before?.linked_task_id) {
    const deltaMs = new Date(newStartAt).getTime() - new Date(before.start_at).getTime();
    const { data: task } = await supabase
      .from("tasks")
      .select("due_at")
      .eq("id", before.linked_task_id)
      .single();
    if (task?.due_at) {
      const newDueAt = new Date(new Date(task.due_at).getTime() + deltaMs).toISOString();
      await supabase.from("tasks").update({ due_at: newDueAt }).eq("id", before.linked_task_id);
      await syncTaskReminder(supabase, userId, before.linked_task_id, newDueAt);
    }
  }
}

export async function rescheduleEvent(eventId: string, newStartAt: string, newEndAt: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await rescheduleEventCore(supabase, userId, eventId, newStartAt, newEndAt);

  revalidatePath("/calendar");
  revalidatePath("/tasks");
}

export async function deleteEventCore(
  supabase: SupabaseClient<Database>,
  eventId: string,
  deleteLinkedTask: boolean
) {
  if (deleteLinkedTask) {
    const { data: event } = await supabase
      .from("events")
      .select("linked_task_id")
      .eq("id", eventId)
      .single();
    if (event?.linked_task_id) {
      await supabase.from("tasks").delete().eq("id", event.linked_task_id);
    }
  }

  await supabase.from("events").delete().eq("id", eventId);
}

export async function deleteEvent(eventId: string, deleteLinkedTask = false) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  await deleteEventCore(supabase, eventId, deleteLinkedTask);

  revalidatePath("/calendar");
  revalidatePath("/tasks");
}
