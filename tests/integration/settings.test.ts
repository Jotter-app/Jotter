import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getHideNoteOnlyTagsCore, updateHideNoteOnlyTagsCore } from "@/lib/actions/settings";

// Requires a running local Supabase stack (`supabase start`). Exercises the
// core functions directly (not the "use server" wrappers) since those call
// currentUserId(), which depends on next/headers' cookies() and only works
// inside an actual Next.js request.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("getHideNoteOnlyTagsCore / updateHideNoteOnlyTagsCore", () => {
  it("defaults to true for a freshly signed-up user (row exists via the profiles trigger)", async () => {
    const user = await createSignedInUser(`settings-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
    expect(await getHideNoteOnlyTagsCore(user.client, user.userId)).toBe(true);
  });

  it("round-trips a write to false and back to true", async () => {
    const user = await createSignedInUser(`settings-${Date.now()}-${Math.random()}@example.com`, "test-password-123");

    await updateHideNoteOnlyTagsCore(user.client, user.userId, false);
    expect(await getHideNoteOnlyTagsCore(user.client, user.userId)).toBe(false);

    await updateHideNoteOnlyTagsCore(user.client, user.userId, true);
    expect(await getHideNoteOnlyTagsCore(user.client, user.userId)).toBe(true);
  });

  it("never lets one user's setting affect another's", async () => {
    const a = await createSignedInUser(`settings-a-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
    const b = await createSignedInUser(`settings-b-${Date.now()}-${Math.random()}@example.com`, "test-password-123");

    await updateHideNoteOnlyTagsCore(a.client, a.userId, false);

    expect(await getHideNoteOnlyTagsCore(a.client, a.userId)).toBe(false);
    expect(await getHideNoteOnlyTagsCore(b.client, b.userId)).toBe(true);
  });
});
