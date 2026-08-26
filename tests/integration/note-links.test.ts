import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { syncNoteLinksCore } from "@/lib/actions/noteLinks";

// Requires a running local Supabase stack (`supabase start`). Exercises
// syncNoteLinksCore directly (rather than through saveNote) since saveNote
// depends on next/headers' cookies() via currentUserId() -- only available
// inside an actual Next.js request, not a plain Vitest process. Mirrors
// tests/integration/task-note-links.test.ts's structure.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("note<->note wikilink sync", () => {
  const suffix = Date.now();
  let userA: { client: SupabaseClient; userId: string };
  let userB: { client: SupabaseClient; userId: string };
  let sourceId: string;
  let targetAId: string;
  let targetBId: string;

  beforeAll(async () => {
    userA = await createSignedInUser(`note-links-a-${suffix}@example.com`, "test-password-123");
    userB = await createSignedInUser(`note-links-b-${suffix}@example.com`, "test-password-123");

    const insert = async (client: SupabaseClient, userId: string, title: string) => {
      const { data } = await client
        .from("notes")
        .insert({ user_id: userId, title, body_markdown: "" })
        .select("id")
        .single();
      return data!.id as string;
    };

    sourceId = await insert(userA.client, userA.userId, "Source Note");
    targetAId = await insert(userA.client, userA.userId, "Target Alpha");
    targetBId = await insert(userA.client, userA.userId, "Target Beta");
  });

  it("creates a link for a resolvable [[wikilink]] in the body", async () => {
    await syncNoteLinksCore(userA.client, userA.userId, sourceId, "See [[Target Alpha]] for details.");

    const { data } = await userA.client.from("note_links").select("target_note_id").eq("source_note_id", sourceId);
    expect(data).toEqual([{ target_note_id: targetAId }]);
  });

  it("re-saving with the same links leaves them unchanged and adds new ones", async () => {
    await syncNoteLinksCore(
      userA.client,
      userA.userId,
      sourceId,
      "See [[Target Alpha]] and also [[Target Beta]]."
    );

    const { data } = await userA.client.from("note_links").select("target_note_id").eq("source_note_id", sourceId);
    expect(new Set(data!.map((row) => row.target_note_id))).toEqual(new Set([targetAId, targetBId]));
  });

  it("removes a link when its wikilink is deleted from the text on the next save", async () => {
    await syncNoteLinksCore(userA.client, userA.userId, sourceId, "Only [[Target Alpha]] remains.");

    const { data } = await userA.client.from("note_links").select("target_note_id").eq("source_note_id", sourceId);
    expect(data).toEqual([{ target_note_id: targetAId }]);
  });

  it("writes nothing for an unresolvable title", async () => {
    await syncNoteLinksCore(userA.client, userA.userId, sourceId, "Links to [[Nothing Here]] only.");

    const { data } = await userA.client.from("note_links").select("target_note_id").eq("source_note_id", sourceId);
    expect(data).toEqual([]);
  });

  it("only resolves against the user's own notes, not another user's", async () => {
    const { data: bNote } = await userB.client
      .from("notes")
      .insert({ user_id: userB.userId, title: "Target Alpha", body_markdown: "" })
      .select("id")
      .single();

    await syncNoteLinksCore(userB.client, userB.userId, bNote!.id, "See [[Target Alpha]].");

    const { data } = await userB.client.from("note_links").select("target_note_id").eq("source_note_id", bNote!.id);
    expect(data).toEqual([{ target_note_id: bNote!.id }]);
  });

  it("cascades and removes the link when the target note is deleted", async () => {
    await syncNoteLinksCore(userA.client, userA.userId, sourceId, "See [[Target Alpha]].");
    await userA.client.from("notes").delete().eq("id", targetAId);

    const { data } = await userA.client.from("note_links").select().eq("source_note_id", sourceId);
    expect(data).toEqual([]);
  });
});
