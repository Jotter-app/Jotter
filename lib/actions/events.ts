"use server";

import { z } from "zod";
import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import { insertTaskCore } from "@/lib/actions/tasks";
import { insertNoteCore } from "@/lib/actions/notes";
import { syncTaskReminder } from "@/lib/reminders/syncTaskReminder";
import { syncEventDebriefReminder } from "@/lib/reminders/syncEventDebriefReminder";
import { DEFAULT_EVENT_DURATION_MS } from "@/lib/jotter/duration";
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
    .select("start_at, linked_task_id, linked_note_id")
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

  // Same idea for the debrief reminder (Tier 3) -- only events with a
  // linked note have one, per syncEventDebriefReminder's own contract.
  if (before?.linked_note_id) {
    await syncEventDebriefReminder(supabase, userId, eventId, newEndAt);
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

// Creates a note pre-filled with the event's date/time range and links it
// back via events.linked_note_id, then arms the post-meeting debrief
// reminder for it. Idempotent -- re-clicking on an event that already has
// a note just returns that note's id rather than creating a duplicate.
export async function generateMeetingNoteCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string
): Promise<{ ok: boolean; noteId: string | null }> {
  const { data: event } = await supabase
    .from("events")
    .select("title, start_at, end_at, linked_note_id")
    .eq("id", eventId)
    .single();
  if (!event) return { ok: false, noteId: null };
  if (event.linked_note_id) return { ok: true, noteId: event.linked_note_id };

  const range = `${format(new Date(event.start_at), "MMM d, yyyy · h:mm a")}–${format(new Date(event.end_at), "h:mm a")}`;
  const result = await insertNoteCore(supabase, userId, {
    folderId: null,
    title: event.title,
    bodyMarkdown: `**${range}**\n\n`,
  });
  if (!result.ok || !result.noteId) return { ok: false, noteId: null };

  await supabase.from("events").update({ linked_note_id: result.noteId }).eq("id", eventId);
  await syncEventDebriefReminder(supabase, userId, eventId, event.end_at);

  return { ok: true, noteId: result.noteId };
}

export async function generateMeetingNote(eventId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, noteId: null };

  const result = await generateMeetingNoteCore(supabase, userId, eventId);

  if (result.ok) {
    revalidatePath("/calendar");
    revalidatePath("/notes");
  }
  return result;
}

// Powers drag-to-timebox: dragging an unscheduled task onto a calendar day
// creates an event linked back to it (the same events.linked_task_id
// column insertEventCore's alsoCreateTask already uses, just populated in
// the other direction), with a fixed 9am default start since this
// calendar is day-granularity throughout -- there's no hour grid to drop
// onto a specific time.
export async function timeboxTaskCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  taskId: string,
  date: Date
): Promise<{ ok: boolean; eventId: string | null }> {
  const { data: task } = await supabase.from("tasks").select("title").eq("id", taskId).single();
  if (!task) return { ok: false, eventId: null };

  const startAt = new Date(date);
  startAt.setHours(9, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + DEFAULT_EVENT_DURATION_MS);

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      user_id: userId,
      title: task.title,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      linked_task_id: taskId,
    })
    .select("id")
    .single();
  if (error || !event) return { ok: false, eventId: null };

  // Keeps the task consistent with a linked event's due date the same way
  // rescheduleEventCore already does on drag-reschedule -- a timeboxed
  // task shouldn't still read "no due date" once it has a calendar block.
  await supabase.from("tasks").update({ due_at: startAt.toISOString() }).eq("id", taskId);
  await syncTaskReminder(supabase, userId, taskId, startAt.toISOString());

  return { ok: true, eventId: event.id };
}

export async function timeboxTask(taskId: string, dateIso: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, eventId: null };

  const result = await timeboxTaskCore(supabase, userId, taskId, new Date(dateIso));

  if (result.ok) {
    revalidatePath("/calendar");
    revalidatePath("/tasks");
  }
  return result;
}
