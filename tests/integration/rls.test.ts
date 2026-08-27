import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Requires a running local Supabase stack (`supabase start`). Verifies the
// RLS policies from Milestone 2 actually isolate users from each other --
// the highest-priority test per the design spec, since a leak here is worse
// than any UI bug.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("RLS cross-user isolation", () => {
  const suffix = Date.now();
  let userA: { client: SupabaseClient; userId: string };
  let userB: { client: SupabaseClient; userId: string };

  let folderId: string;
  let noteId: string;
  let tagId: string;
  let taskId: string;
  let eventId: string;
  let taggableTagId: string;
  let reminderId: string;
  let pushSubscriptionId: string;

  beforeAll(async () => {
    userA = await createSignedInUser(`rls-a-${suffix}@example.com`, "test-password-123");
    userB = await createSignedInUser(`rls-b-${suffix}@example.com`, "test-password-123");

    const insert = async <T,>(table: string, row: Record<string, unknown>) => {
      const { data, error } = await userA.client
        .from(table)
        .insert({ ...row, user_id: userA.userId })
        .select()
        .single();
      if (error) throw new Error(`seeding ${table} failed: ${error.message}`);
      return data as T & { id: string };
    };

    folderId = (await insert<{ id: string }>("folders", { name: "A's folder" })).id;
    noteId = (await insert<{ id: string }>("notes", { title: "A's note", body_markdown: "secret", folder_id: folderId })).id;
    tagId = (await insert<{ id: string }>("tags", { name: `a-tag-${suffix}` })).id;
    taskId = (await insert<{ id: string }>("tasks", { title: "A's task" })).id;
    eventId = (
      await insert<{ id: string }>("events", {
        title: "A's event",
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 3600_000).toISOString(),
      })
    ).id;
    reminderId = (await insert<{ id: string }>("reminders", { task_id: taskId, fire_at: new Date().toISOString(), channel: "email" })).id;
    pushSubscriptionId = (
      await insert<{ id: string }>("push_subscriptions", {
        endpoint: `https://push.example.com/${suffix}`,
        p256dh: "key",
        auth_key: "auth",
      })
    ).id;

    const { data: taggable, error: taggableError } = await userA.client
      .from("taggables")
      .insert({ tag_id: tagId, user_id: userA.userId, taggable_id: taskId, taggable_type: "task" })
      .select()
      .single();
    if (taggableError) throw new Error(`seeding taggables failed: ${taggableError.message}`);
    taggableTagId = taggable.tag_id;
  });

  const cases: Array<[string, () => string]> = [
    ["folders", () => folderId],
    ["notes", () => noteId],
    ["tags", () => tagId],
    ["tasks", () => taskId],
    ["events", () => eventId],
    ["reminders", () => reminderId],
    ["push_subscriptions", () => pushSubscriptionId],
  ];

  it.each(cases)("user B cannot select user A's row in %s", async (table, getId) => {
    const { data, error } = await userB.client.from(table).select().eq("id", getId());
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each(cases)("user A can select their own row in %s", async (table, getId) => {
    const { data, error } = await userA.client.from(table).select().eq("id", getId());
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("user B cannot select user A's taggables row", async () => {
    const { data, error } = await userB.client
      .from("taggables")
      .select()
      .eq("tag_id", taggableTagId)
      .eq("taggable_id", taskId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("user B's update against user A's folder silently affects zero rows", async () => {
    const { data, error } = await userB.client
      .from("folders")
      .update({ name: "hacked" })
      .eq("id", folderId)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: stillA } = await userA.client.from("folders").select("name").eq("id", folderId).single();
    expect(stillA?.name).toBe("A's folder");
  });

  it("user B's delete against user A's folder silently affects zero rows", async () => {
    const { error } = await userB.client.from("folders").delete().eq("id", folderId);
    expect(error).toBeNull();

    const { data: stillA } = await userA.client.from("folders").select().eq("id", folderId);
    expect(stillA).toHaveLength(1);
  });

  it("user B cannot insert a row impersonating user A's user_id", async () => {
    const { error } = await userB.client.from("folders").insert({ name: "forged", user_id: userA.userId });
    expect(error).not.toBeNull();
  });

  // profiles is keyed by user_id (no separate id column), auto-created by
  // the on-signup trigger -- doesn't fit the generic `cases` array above,
  // so it gets its own bespoke assertions.
  it("user B cannot select user A's profile row", async () => {
    const { data, error } = await userB.client.from("profiles").select().eq("user_id", userA.userId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("user A can select their own profile row", async () => {
    const { data, error } = await userA.client.from("profiles").select().eq("user_id", userA.userId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("user B's update against user A's profile row silently affects zero rows", async () => {
    const { data, error } = await userB.client
      .from("profiles")
      .update({ default_event_creates_task: false })
      .eq("user_id", userA.userId)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: stillA } = await userA.client
      .from("profiles")
      .select("default_event_creates_task")
      .eq("user_id", userA.userId)
      .single();
    expect(stillA?.default_event_creates_task).toBe(true);
  });
});
