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
import { pushEventCreate, pushEventDelete, pushEventUpdate } from "@/lib/calendar-sync/push";
import type { Database } from "@/lib/supabase/database.types";

const eventSchema = z.object({
  title: z.string().trim().min(1),
  startAt: z.string(),
  endAt: z.string(),
  calendarColor: z.string().default("#7a8a5e"),
  alsoCreateTask: z.string().optional(),
  repeats: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
  syncToGoogle: z.string().optional(),
});

// Fixed, non-editable rules -- see the Tier 5 spec's Non-Goals for why
// this stops at three static options rather than a general RRULE builder.
const RECURRENCE_RULES: Record<string, string | undefined> = {
  none: undefined,
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
};

export interface EventFormState {
  error: string | null;
}

export interface InsertEventParams {
  title: string;
  startAt: string;
  endAt: string;
  calendarColor?: string;
  alsoCreateTask?: boolean;
  recurrenceRule?: string;
  syncEnabled?: boolean;
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
  {
    title,
    startAt,
    endAt,
    calendarColor = "#7a8a5e",
    alsoCreateTask = false,
    recurrenceRule,
    syncEnabled = false,
  }: InsertEventParams
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
      recurrence_rule: recurrenceRule ?? null,
      sync_enabled: syncEnabled,
    })
    .select("id")
    .single();
  if (error || !event) {
    return { ok: false, eventId: null, error: error?.message ?? "Could not create event." };
  }

  // Self-referencing series_id (Tier 5) -- can only be set once the row's
  // own id exists, so this is a follow-up update rather than part of the
  // insert. "Every occurrence of this series" is then always a uniform
  // `where series_id = X` query, this master row included.
  if (recurrenceRule) {
    await supabase.from("events").update({ series_id: event.id }).eq("id", event.id);
  }

  // Push-on-write: best-effort, never blocks event creation from
  // succeeding. externalId can come back null if the Google call itself
  // failed -- calendar_connection_id is still stamped in that case so the
  // next pull-cron tick finds this row (sync_enabled + external_id is
  // null) and retries the push.
  if (syncEnabled) {
    const pushed = await pushEventCreate(supabase, userId, { title, startAt, endAt });
    if (pushed) {
      await supabase
        .from("events")
        .update({ calendar_connection_id: pushed.connectionId, external_id: pushed.externalId })
        .eq("id", event.id);
    }
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
    repeats: formData.get("repeats") || undefined,
    syncToGoogle: formData.get("syncToGoogle") || undefined,
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
    recurrenceRule: RECURRENCE_RULES[parsed.data.repeats],
    syncEnabled: parsed.data.syncToGoogle === "on",
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
    .select("title, start_at, linked_task_id, linked_note_id, sync_enabled, calendar_connection_id, external_id")
    .eq("id", eventId)
    .single();

  await supabase.from("events").update({ start_at: newStartAt, end_at: newEndAt }).eq("id", eventId);

  if (before?.sync_enabled && before.calendar_connection_id && before.external_id) {
    await pushEventUpdate(supabase, before.calendar_connection_id, before.external_id, {
      title: before.title,
      startAt: newStartAt,
      endAt: newEndAt,
    });
  }

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
  const { data: event } = await supabase
    .from("events")
    .select("linked_task_id, sync_enabled, calendar_connection_id, external_id")
    .eq("id", eventId)
    .single();

  if (deleteLinkedTask && event?.linked_task_id) {
    await supabase.from("tasks").delete().eq("id", event.linked_task_id);
  }

  // Pushed before the local delete so a failed remote call is still visible
  // (the connection's status/last_error) without having already lost the
  // row's external_id/calendar_connection_id.
  if (event?.sync_enabled && event.calendar_connection_id && event.external_id) {
    await pushEventDelete(supabase, event.calendar_connection_id, event.external_id);
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
    .select("title, start_at, end_at, linked_note_id, series_id")
    .eq("id", eventId)
    .single();
  if (!event) return { ok: false, noteId: null };
  if (event.linked_note_id) return { ok: true, noteId: event.linked_note_id };

  // Tier 5: thread this occurrence to whichever prior occurrence in the
  // same series most recently got a note, via a real [[wikilink]] rather
  // than a new "previous occurrence" column -- same trick the weekly
  // review (Tier 3) uses for its "notes touched" section, reusing the
  // existing wikilink resolver/backlinks panel as-is. A non-recurring
  // event has no series_id, so this whole branch is a no-op for it.
  let previousNoteTitle: string | null = null;
  if (event.series_id) {
    const { data: prior } = await supabase
      .from("events")
      .select("linked_note_id")
      .eq("series_id", event.series_id)
      .not("linked_note_id", "is", null)
      .lt("start_at", event.start_at)
      .order("start_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior?.linked_note_id) {
      const { data: prevNote } = await supabase.from("notes").select("title").eq("id", prior.linked_note_id).single();
      previousNoteTitle = prevNote?.title ?? null;
    }
  }

  const range = `${format(new Date(event.start_at), "MMM d, yyyy · h:mm a")}–${format(new Date(event.end_at), "h:mm a")}`;
  const bodyMarkdown = previousNoteTitle ? `**${range}**\n\nPrevious: [[${previousNoteTitle}]]\n\n` : `**${range}**\n\n`;
  // Every occurrence of a series shares the exact same event.title -- a
  // bare title would make every occurrence's note collide, and
  // resolveWikilinkTitle's "most recently edited wins" tie-break would
  // make a "Previous" wikilink resolve to whichever note was touched most
  // recently (often itself) instead of the actual prior occurrence. The
  // date suffix makes each occurrence's note title unique so the wikilink
  // resolves unambiguously. A non-recurring event (no series_id) keeps its
  // bare title exactly as before.
  const title = event.series_id ? `${event.title} — ${format(new Date(event.start_at), "MMM d, yyyy")}` : event.title;
  const result = await insertNoteCore(supabase, userId, {
    folderId: null,
    title,
    bodyMarkdown,
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

// Turns a virtual (not-yet-real) recurring occurrence into an actual
// events row, copying the series master's title/color. Once this exists,
// it's an ordinary event -- same tag picker, drag-reschedule, and delete
// every other event already has, no special-casing needed anywhere else.
export async function materializeOccurrenceCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  seriesId: string,
  startAtIso: string,
  endAtIso: string
): Promise<{ ok: boolean; eventId: string | null }> {
  const { data: master } = await supabase.from("events").select("title, calendar_color").eq("id", seriesId).single();
  if (!master) return { ok: false, eventId: null };

  const { data: occurrence, error } = await supabase
    .from("events")
    .insert({
      user_id: userId,
      title: master.title,
      start_at: startAtIso,
      end_at: endAtIso,
      calendar_color: master.calendar_color,
      series_id: seriesId,
    })
    .select("id")
    .single();
  if (error || !occurrence) return { ok: false, eventId: null };

  return { ok: true, eventId: occurrence.id };
}

// Materializes the occurrence, then delegates to generateMeetingNoteCore
// (already series-aware) for the actual note creation + previous-occurrence
// threading + debrief-reminder arming, rather than duplicating any of that.
export async function materializeOccurrenceAndGenerateNote(seriesId: string, startAtIso: string, endAtIso: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, eventId: null, noteId: null };

  const materialized = await materializeOccurrenceCore(supabase, userId, seriesId, startAtIso, endAtIso);
  if (!materialized.ok || !materialized.eventId) return { ok: false, eventId: null, noteId: null };

  const noteResult = await generateMeetingNoteCore(supabase, userId, materialized.eventId);
  if (noteResult.ok) {
    revalidatePath("/calendar");
    revalidatePath("/notes");
  }
  return { ok: noteResult.ok, eventId: materialized.eventId, noteId: noteResult.noteId };
}
