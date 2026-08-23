import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { insertEventCore, rescheduleEventCore, deleteEventCore } from "@/lib/actions/events";

// Requires a running local Supabase stack (`supabase start`). Exercises
// insertEventCore/rescheduleEventCore/deleteEventCore directly (rather than
// the exported createEvent/rescheduleEvent/deleteEvent actions) since those
// wrappers call currentUserId(), which depends on next/headers' cookies()
// and only works inside an actual Next.js request -- not a plain Vitest
// process. The *Core functions are exactly what those actions delegate to,
// so this still covers the real logic.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("event<->task linking", () => {
  const suffix = Date.now();
  let user: { client: SupabaseClient; userId: string };

  beforeAll(async () => {
    user = await createSignedInUser(`linked-tasks-${suffix}@example.com`, "test-password-123");
  });

  it("creating an event with alsoCreateTask produces a linked task with a matching due date and an unsent reminder", async () => {
    const startAt = new Date(Date.now() + 3_600_000).toISOString();
    const endAt = new Date(Date.now() + 7_200_000).toISOString();

    const result = await insertEventCore(user.client, user.userId, {
      title: "Linked event",
      startAt,
      endAt,
      alsoCreateTask: true,
    });
    expect(result.ok).toBe(true);

    const { data: event } = await user.client
      .from("events")
      .select("linked_task_id")
      .eq("id", result.eventId!)
      .single();
    expect(event?.linked_task_id).not.toBeNull();

    const { data: task } = await user.client
      .from("tasks")
      .select("title, due_at")
      .eq("id", event!.linked_task_id!)
      .single();
    expect(task?.title).toBe("Linked event");
    expect(new Date(task!.due_at!).getTime()).toBe(new Date(startAt).getTime());

    const { data: reminder } = await user.client
      .from("reminders")
      .select("fire_at, sent_at")
      .eq("task_id", event!.linked_task_id!)
      .single();
    expect(new Date(reminder!.fire_at).getTime()).toBe(new Date(startAt).getTime());
    expect(reminder?.sent_at).toBeNull();
  });

  it("creating an event without alsoCreateTask leaves linked_task_id null", async () => {
    const startAt = new Date(Date.now() + 3_600_000).toISOString();
    const endAt = new Date(Date.now() + 7_200_000).toISOString();

    const result = await insertEventCore(user.client, user.userId, {
      title: "Unlinked event",
      startAt,
      endAt,
    });
    expect(result.ok).toBe(true);

    const { data: event } = await user.client
      .from("events")
      .select("linked_task_id")
      .eq("id", result.eventId!)
      .single();
    expect(event?.linked_task_id).toBeNull();
  });

  it("rescheduling an event shifts its linked task's due date and reminder by the same delta", async () => {
    const startAt = new Date(Date.now() + 3_600_000).toISOString();
    const endAt = new Date(Date.now() + 7_200_000).toISOString();

    const { eventId } = await insertEventCore(user.client, user.userId, {
      title: "Reschedule me",
      startAt,
      endAt,
      alsoCreateTask: true,
    });

    const deltaMs = 2 * 24 * 3_600_000; // +2 days
    const newStartAt = new Date(new Date(startAt).getTime() + deltaMs).toISOString();
    const newEndAt = new Date(new Date(endAt).getTime() + deltaMs).toISOString();
    await rescheduleEventCore(user.client, user.userId, eventId!, newStartAt, newEndAt);

    const { data: event } = await user.client
      .from("events")
      .select("linked_task_id")
      .eq("id", eventId!)
      .single();
    const { data: task } = await user.client
      .from("tasks")
      .select("due_at")
      .eq("id", event!.linked_task_id!)
      .single();
    expect(new Date(task!.due_at!).getTime()).toBe(new Date(newStartAt).getTime());

    const { data: reminder } = await user.client
      .from("reminders")
      .select("fire_at")
      .eq("task_id", event!.linked_task_id!)
      .single();
    expect(new Date(reminder!.fire_at).getTime()).toBe(new Date(newStartAt).getTime());
  });

  it("deleting an event with deleteLinkedTask=true also deletes the linked task", async () => {
    const { eventId } = await insertEventCore(user.client, user.userId, {
      title: "Delete me and my task",
      startAt: new Date(Date.now() + 3_600_000).toISOString(),
      endAt: new Date(Date.now() + 7_200_000).toISOString(),
      alsoCreateTask: true,
    });
    const { data: event } = await user.client
      .from("events")
      .select("linked_task_id")
      .eq("id", eventId!)
      .single();
    const linkedTaskId = event!.linked_task_id!;

    await deleteEventCore(user.client, eventId!, true);

    const { data: task } = await user.client.from("tasks").select().eq("id", linkedTaskId);
    expect(task).toEqual([]);
  });

  it("deleting an event with deleteLinkedTask=false keeps the task standalone", async () => {
    const { eventId } = await insertEventCore(user.client, user.userId, {
      title: "Delete me, keep my task",
      startAt: new Date(Date.now() + 3_600_000).toISOString(),
      endAt: new Date(Date.now() + 7_200_000).toISOString(),
      alsoCreateTask: true,
    });
    const { data: event } = await user.client
      .from("events")
      .select("linked_task_id")
      .eq("id", eventId!)
      .single();
    const linkedTaskId = event!.linked_task_id!;

    await deleteEventCore(user.client, eventId!, false);

    const { data: task } = await user.client.from("tasks").select().eq("id", linkedTaskId);
    expect(task).toHaveLength(1);
  });

  it("deleting the task directly un-links the event rather than leaving a dangling reference", async () => {
    const { eventId } = await insertEventCore(user.client, user.userId, {
      title: "Task deleted out from under me",
      startAt: new Date(Date.now() + 3_600_000).toISOString(),
      endAt: new Date(Date.now() + 7_200_000).toISOString(),
      alsoCreateTask: true,
    });
    const { data: eventBefore } = await user.client
      .from("events")
      .select("linked_task_id")
      .eq("id", eventId!)
      .single();
    const linkedTaskId = eventBefore!.linked_task_id!;

    await user.client.from("tasks").delete().eq("id", linkedTaskId);

    const { data: eventAfter } = await user.client
      .from("events")
      .select("linked_task_id")
      .eq("id", eventId!)
      .single();
    expect(eventAfter?.linked_task_id).toBeNull();
  });
});
