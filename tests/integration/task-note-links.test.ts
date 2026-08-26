import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { linkTaskNoteCore, unlinkTaskNoteCore } from "@/lib/actions/taskNoteLinks";

// Requires a running local Supabase stack (`supabase start`). Exercises
// linkTaskNoteCore/unlinkTaskNoteCore directly (rather than the exported
// linkTaskNote/unlinkTaskNote actions) since those wrappers call
// currentUserId(), which depends on next/headers' cookies() and only works
// inside an actual Next.js request -- not a plain Vitest process.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("task<->note linking", () => {
  const suffix = Date.now();
  let userA: { client: SupabaseClient; userId: string };
  let userB: { client: SupabaseClient; userId: string };
  let taskId: string;
  let noteId: string;

  beforeAll(async () => {
    userA = await createSignedInUser(`task-note-a-${suffix}@example.com`, "test-password-123");
    userB = await createSignedInUser(`task-note-b-${suffix}@example.com`, "test-password-123");

    const { data: task } = await userA.client
      .from("tasks")
      .insert({ user_id: userA.userId, title: "A's task" })
      .select("id")
      .single();
    taskId = task!.id;

    const { data: note } = await userA.client
      .from("notes")
      .insert({ user_id: userA.userId, title: "A's note", body_markdown: "" })
      .select("id")
      .single();
    noteId = note!.id;
  });

  it("links a task and a note, queryable from both directions", async () => {
    await linkTaskNoteCore(userA.client, userA.userId, taskId, noteId);

    const { data: fromTask } = await userA.client.from("task_note_links").select("note_id").eq("task_id", taskId);
    expect(fromTask).toEqual([{ note_id: noteId }]);

    const { data: fromNote } = await userA.client.from("task_note_links").select("task_id").eq("note_id", noteId);
    expect(fromNote).toEqual([{ task_id: taskId }]);
  });

  it("linking an already-linked pair is a no-op, not a duplicate or an error", async () => {
    await linkTaskNoteCore(userA.client, userA.userId, taskId, noteId);

    const { data, error } = await userA.client
      .from("task_note_links")
      .select("id")
      .eq("task_id", taskId)
      .eq("note_id", noteId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("user B cannot see or create a link on user A's task/note", async () => {
    const { data } = await userB.client.from("task_note_links").select().eq("task_id", taskId);
    expect(data).toEqual([]);

    const { error } = await userB.client
      .from("task_note_links")
      .insert({ user_id: userB.userId, task_id: taskId, note_id: noteId });
    // Blocked either by the FK (task/note rows aren't visible/owned by B)
    // or by RLS's with-check -- either way, no row should exist for B.
    const { data: afterAttempt } = await userA.client
      .from("task_note_links")
      .select()
      .eq("task_id", taskId)
      .eq("user_id", userB.userId);
    expect(afterAttempt).toEqual([]);
    expect(error).not.toBeNull();
  });

  it("unlinking removes the row", async () => {
    await unlinkTaskNoteCore(userA.client, taskId, noteId);

    const { data } = await userA.client.from("task_note_links").select().eq("task_id", taskId).eq("note_id", noteId);
    expect(data).toEqual([]);
  });

  it("deleting the task cascades and removes the link", async () => {
    await linkTaskNoteCore(userA.client, userA.userId, taskId, noteId);
    await userA.client.from("tasks").delete().eq("id", taskId);

    const { data } = await userA.client.from("task_note_links").select().eq("note_id", noteId);
    expect(data).toEqual([]);
  });
});
