import { beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deleteFolderCore } from "@/lib/actions/folders";

// Requires a running local Supabase stack (`supabase start`). Exercises
// deleteFolderCore directly (rather than the exported deleteFolder action)
// since that wrapper calls currentUserId(), which depends on
// next/headers' cookies() and only works inside an actual Next.js request.
//
// Focus: "cascade-delete-notes" needs to walk the *entire* descendant
// folder tree (arbitrary depth) before deleting notes, not just the
// top-level folder's direct children -- that's the one genuinely new,
// easy-to-get-wrong piece of logic here. The existing "cascade" and
// "move-to-parent" modes are re-verified too, as a regression check that
// extracting deleteFolderCore didn't change their behavior.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("folder cascade-delete modes", () => {
  const suffix = Date.now();
  let user: { client: SupabaseClient; userId: string };

  beforeEach(async () => {
    user = await createSignedInUser(`folder-cascade-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
  });

  async function makeFolder(name: string, parentFolderId: string | null) {
    const { data } = await user.client
      .from("folders")
      .insert({ user_id: user.userId, name, parent_folder_id: parentFolderId })
      .select("id")
      .single();
    return data!.id as string;
  }

  async function makeNote(title: string, folderId: string | null) {
    const { data } = await user.client
      .from("notes")
      .insert({ user_id: user.userId, title, body_markdown: "", folder_id: folderId })
      .select("id")
      .single();
    return data!.id as string;
  }

  it("cascade-delete-notes deletes every note in an arbitrarily deep subtree", async () => {
    const a = await makeFolder("A", null);
    const b = await makeFolder("B", a);
    const c = await makeFolder("C", b);
    const noteInA = await makeNote("note in A", a);
    const noteInB = await makeNote("note in B", b);
    const noteInC = await makeNote("note in C", c);

    await deleteFolderCore(user.client, user.userId, { folderId: a, mode: "cascade-delete-notes" });

    const { data: folders } = await user.client.from("folders").select("id").in("id", [a, b, c]);
    expect(folders).toEqual([]);

    const { data: notes } = await user.client
      .from("notes")
      .select("id")
      .in("id", [noteInA, noteInB, noteInC]);
    expect(notes).toEqual([]);
  });

  it("cascade-delete-notes on a sub-folder leaves siblings and their notes untouched", async () => {
    const root = await makeFolder("Root", null);
    const keep = await makeFolder("Keep", root);
    const remove = await makeFolder("Remove", root);
    const noteToKeep = await makeNote("keep me", keep);
    const noteToRemove = await makeNote("remove me", remove);

    await deleteFolderCore(user.client, user.userId, { folderId: remove, mode: "cascade-delete-notes" });

    const { data: keptNote } = await user.client.from("notes").select().eq("id", noteToKeep);
    expect(keptNote).toHaveLength(1);

    const { data: removedNote } = await user.client.from("notes").select().eq("id", noteToRemove);
    expect(removedNote).toEqual([]);

    const { data: keptFolder } = await user.client.from("folders").select().eq("id", keep);
    expect(keptFolder).toHaveLength(1);
  });

  it("plain cascade still unfiles notes instead of deleting them (regression check)", async () => {
    const folder = await makeFolder("Unfile me", null);
    const noteId = await makeNote("survives as unfiled", folder);

    await deleteFolderCore(user.client, user.userId, { folderId: folder, mode: "cascade" });

    const { data: note } = await user.client.from("notes").select("folder_id").eq("id", noteId).single();
    expect(note?.folder_id).toBeNull();
  });

  it("move-to-parent still re-parents direct children and preserves deeper nesting (regression check)", async () => {
    const root = await makeFolder("Root", null);
    const middle = await makeFolder("Middle", root);
    const grandchild = await makeFolder("Grandchild", middle);
    const noteInMiddle = await makeNote("direct note", middle);

    await deleteFolderCore(user.client, user.userId, { folderId: middle, mode: "move-to-parent" });

    const { data: reparentedFolder } = await user.client
      .from("folders")
      .select("parent_folder_id")
      .eq("id", grandchild)
      .single();
    expect(reparentedFolder?.parent_folder_id).toBe(root);

    const { data: reparentedNote } = await user.client.from("notes").select("folder_id").eq("id", noteInMiddle).single();
    expect(reparentedNote?.folder_id).toBe(root);
  });
});
