import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dispatchJotterCore } from "@/lib/jotter/dispatch";

// Requires a running local Supabase stack (`supabase start`). Exercises
// dispatchJotterCore directly (rather than the exported dispatchJotter
// action) since that wrapper calls currentUserId(), which depends on
// next/headers' cookies() and only works inside an actual Next.js request
// -- not a plain Vitest process. dispatchJotterCore is exactly what that
// wrapper delegates to, so this still covers the real dispatch logic for
// all three routes plus explicit-command parsing end to end.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("dispatchJotterCore", () => {
  const suffix = Date.now();
  let user: { client: SupabaseClient; userId: string };

  beforeAll(async () => {
    user = await createSignedInUser(`jotter-dispatch-${suffix}@example.com`, "test-password-123");
  });

  it("implicitly creates a task with a due date and tags from plain text", async () => {
    const result = await dispatchJotterCore(user.client, user.userId, "call mom tomorrow 5pm #family");
    expect(result.ok).toBe(true);
    expect(result.route).toBe("task");

    const { data: task } = await user.client.from("tasks").select("title, due_at").eq("title", "call mom").single();
    expect(task).not.toBeNull();
    expect(task?.due_at).not.toBeNull();

    const { data: tag } = await user.client.from("tags").select("id").eq("name", "family").single();
    const { data: taggable } = await user.client
      .from("taggables")
      .select()
      .eq("tag_id", tag!.id)
      .eq("taggable_type", "task");
    expect(taggable).toHaveLength(1);
  });

  it("implicitly creates a calendar event from a time range", async () => {
    const result = await dispatchJotterCore(user.client, user.userId, "team sync tomorrow 2-3pm");
    expect(result.ok).toBe(true);
    expect(result.route).toBe("event");

    const { data: event } = await user.client.from("events").select("start_at, end_at").eq("title", "team sync").single();
    expect(event).not.toBeNull();
    expect(new Date(event!.end_at).getTime() - new Date(event!.start_at).getTime()).toBe(3_600_000);
  });

  it("implicitly creates a note from long text and returns a redirect target", async () => {
    const result = await dispatchJotterCore(
      user.client,
      user.userId,
      "Meeting notes\nDiscussed the roadmap and next steps for the quarter."
    );
    expect(result.ok).toBe(true);
    expect(result.route).toBe("note");
    expect(result.redirectTo).toMatch(/^\/notes\//);

    const { data: note } = await user.client.from("notes").select("title, body_markdown").eq("title", "Meeting notes").single();
    expect(note?.body_markdown).toBe("Discussed the roadmap and next steps for the quarter.");
  });

  it('explicitly creates a task via "/task create ..."', async () => {
    const result = await dispatchJotterCore(user.client, user.userId, '/task create "buy milk" tomorrow 9am');
    expect(result.ok).toBe(true);
    expect(result.route).toBe("task");

    const { data: task } = await user.client.from("tasks").select().eq("title", "buy milk").single();
    expect(task).not.toBeNull();
  });

  it('explicitly creates a note via "/note create ..." with tags extracted from the content', async () => {
    const result = await dispatchJotterCore(
      user.client,
      user.userId,
      '/note create "Grocery list" "milk, eggs, bread #errands"'
    );
    expect(result.ok).toBe(true);
    expect(result.route).toBe("note");

    const { data: note } = await user.client.from("notes").select("body_markdown").eq("title", "Grocery list").single();
    expect(note?.body_markdown).toContain("#errands");
  });

  it("respects a routeOverride on implicit input", async () => {
    // "buy stamps" alone has no date signal and would normally route to a
    // task -- overriding to "note" should produce a note instead.
    const result = await dispatchJotterCore(user.client, user.userId, "buy stamps", "note");
    expect(result.ok).toBe(true);
    expect(result.route).toBe("note");

    const { data: note } = await user.client.from("notes").select().eq("title", "buy stamps");
    expect(note).toHaveLength(1);
  });

  it("returns an error for a malformed explicit command without creating anything", async () => {
    const before = await user.client.from("tasks").select("id");
    const result = await dispatchJotterCore(user.client, user.userId, "/task edit \"nope\"");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();

    const after = await user.client.from("tasks").select("id");
    expect(after.data).toHaveLength(before.data!.length);
  });
});
