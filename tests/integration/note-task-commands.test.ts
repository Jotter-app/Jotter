import { beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { processNoteTaskCommands } from "@/lib/jotter/processNoteCommands";

// Requires a running local Supabase stack (`supabase start`). Exercises
// processNoteTaskCommands directly against real Supabase -- it already
// takes supabase/userId as plain arguments (no currentUserId() dependency),
// so no request-scoped wrapper needed here.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("processNoteTaskCommands", () => {
  let user: { client: SupabaseClient; userId: string };
  let noteId: string;

  beforeEach(async () => {
    user = await createSignedInUser(`note-task-cmd-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
    const { data } = await user.client
      .from("notes")
      .insert({ user_id: user.userId, title: "Test note", body_markdown: "" })
      .select("id")
      .single();
    noteId = data!.id;
  });

  it("creates a linked task from a command line and replaces it with a checkbox", async () => {
    const body = 'Meeting notes\n/task create "call mom" tomorrow 5pm #family\nMore text.';
    const result = await processNoteTaskCommands(user.client, user.userId, noteId, body);

    expect(result).not.toContain("/task create");
    expect(result.split("\n")[1]).toMatch(/^- \[ \] call mom \(due .+\) #family$/);

    const { data: task } = await user.client.from("tasks").select("id, title, due_at").eq("title", "call mom").single();
    expect(task).not.toBeNull();
    expect(task?.due_at).not.toBeNull();

    const { data: link } = await user.client
      .from("task_note_links")
      .select()
      .eq("task_id", task!.id)
      .eq("note_id", noteId);
    expect(link).toHaveLength(1);
  });

  it("handles multiple command lines, creating one task per line", async () => {
    const body = ['/task create "buy milk" tomorrow 9am', '/task create "walk the dog" tomorrow 6pm'].join("\n");
    await processNoteTaskCommands(user.client, user.userId, noteId, body);

    const { data: links } = await user.client.from("task_note_links").select("task_id").eq("note_id", noteId);
    expect(links).toHaveLength(2);
  });

  it("leaves a body with no command lines completely unchanged", async () => {
    const body = "Just some ordinary notes about the roadmap.";
    const result = await processNoteTaskCommands(user.client, user.userId, noteId, body);

    expect(result).toBe(body);
    const { data: links } = await user.client.from("task_note_links").select().eq("note_id", noteId);
    expect(links).toEqual([]);
  });

  it("leaves a malformed command line untouched and creates nothing", async () => {
    const body = '/task create "no date here"';
    const result = await processNoteTaskCommands(user.client, user.userId, noteId, body);

    expect(result).toBe(body);
    const { data: links } = await user.client.from("task_note_links").select().eq("note_id", noteId);
    expect(links).toEqual([]);
  });

  it("is idempotent -- re-processing an already-transformed body creates no duplicate task", async () => {
    const body = '/task create "call mom" tomorrow 5pm';
    const firstPass = await processNoteTaskCommands(user.client, user.userId, noteId, body);
    const secondPass = await processNoteTaskCommands(user.client, user.userId, noteId, firstPass);

    expect(secondPass).toBe(firstPass);

    const { data: tasks } = await user.client.from("tasks").select("id").eq("title", "call mom");
    expect(tasks).toHaveLength(1);
  });
});
