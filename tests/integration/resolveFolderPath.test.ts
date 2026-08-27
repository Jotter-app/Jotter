import { beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createFolderPathCache, resolveFolderPath } from "@/lib/notes/resolveFolderPath";

// Requires a running local Supabase stack (`supabase start`). Exercises
// resolveFolderPath directly against real Supabase -- it already takes
// supabase/userId as plain arguments (no currentUserId() dependency).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("resolveFolderPath", () => {
  let user: { client: SupabaseClient; userId: string };

  beforeEach(async () => {
    user = await createSignedInUser(`resolve-folder-path-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
  });

  it("returns null for an empty path (the root)", async () => {
    const folderId = await resolveFolderPath(user.client, user.userId, [], createFolderPathCache());
    expect(folderId).toBeNull();
  });

  it("creates a multi-level folder chain that doesn't exist yet", async () => {
    const folderId = await resolveFolderPath(user.client, user.userId, ["Work", "Projects"], createFolderPathCache());

    const { data: projects } = await user.client.from("folders").select("name, parent_folder_id").eq("id", folderId!).single();
    expect(projects?.name).toBe("Projects");

    const { data: work } = await user.client.from("folders").select("name, parent_folder_id").eq("id", projects!.parent_folder_id!).single();
    expect(work?.name).toBe("Work");
    expect(work?.parent_folder_id).toBeNull();
  });

  it("reuses an existing folder chain instead of creating a duplicate", async () => {
    const first = await resolveFolderPath(user.client, user.userId, ["Work", "Projects"], createFolderPathCache());
    const second = await resolveFolderPath(user.client, user.userId, ["Work", "Projects"], createFolderPathCache());

    expect(second).toBe(first);

    const { data: workFolders } = await user.client.from("folders").select("id").eq("user_id", user.userId).eq("name", "Work");
    expect(workFolders).toHaveLength(1);
  });

  it("reuses the shared prefix and only creates the new tail of an overlapping path", async () => {
    const projectsId = await resolveFolderPath(user.client, user.userId, ["Work", "Projects"], createFolderPathCache());
    const archiveId = await resolveFolderPath(user.client, user.userId, ["Work", "Archive"], createFolderPathCache());

    expect(archiveId).not.toBe(projectsId);

    const { data: workFolders } = await user.client.from("folders").select("id").eq("user_id", user.userId).eq("name", "Work");
    expect(workFolders).toHaveLength(1);

    const { data: archive } = await user.client.from("folders").select("parent_folder_id").eq("id", archiveId!).single();
    const { data: projects } = await user.client.from("folders").select("parent_folder_id").eq("id", projectsId!).single();
    expect(archive?.parent_folder_id).toBe(projects?.parent_folder_id);
  });

  it("reuses folders already resolved earlier in the same cache across calls in one batch", async () => {
    const cache = createFolderPathCache();
    const a = await resolveFolderPath(user.client, user.userId, ["Work", "Projects"], cache);
    const b = await resolveFolderPath(user.client, user.userId, ["Work", "Projects"], cache);
    expect(b).toBe(a);
  });

  it("never matches another user's same-named folder", async () => {
    const otherUser = await createSignedInUser(`resolve-folder-path-other-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
    const otherFolderId = await resolveFolderPath(otherUser.client, otherUser.userId, ["Shared Name"], createFolderPathCache());

    const myFolderId = await resolveFolderPath(user.client, user.userId, ["Shared Name"], createFolderPathCache());

    expect(myFolderId).not.toBe(otherFolderId);
  });
});
