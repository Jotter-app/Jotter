import { beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { buildNotesExport } from "@/lib/notes/exportNotes";
import { parseNoteFile } from "@/lib/notes/noteFrontmatter";

// jszip auto-creates explicit directory entries ("Projects/") alongside
// any file nested inside one -- only the file paths matter for these
// assertions, so directory entries are filtered out.
function filePaths(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((path) => !zip.files[path].dir)
    .sort();
}

// Requires a running local Supabase stack (`supabase start`). Exercises
// buildNotesExport directly against real Supabase.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("buildNotesExport", () => {
  let user: { client: SupabaseClient; userId: string };

  beforeEach(async () => {
    user = await createSignedInUser(`export-notes-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
  });

  async function makeFolder(name: string, parentFolderId: string | null) {
    const { data } = await user.client
      .from("folders")
      .insert({ user_id: user.userId, name, parent_folder_id: parentFolderId })
      .select("id")
      .single();
    return data!.id as string;
  }

  async function makeNote(title: string, body: string, folderId: string | null) {
    const { data } = await user.client
      .from("notes")
      .insert({ user_id: user.userId, title, body_markdown: body, folder_id: folderId })
      .select("id")
      .single();
    return data!.id as string;
  }

  async function tagNote(noteId: string, tagName: string) {
    const { data: tag } = await user.client.from("tags").insert({ user_id: user.userId, name: tagName }).select("id").single();
    await user.client
      .from("taggables")
      .insert({ user_id: user.userId, tag_id: tag!.id, taggable_id: noteId, taggable_type: "note" });
  }

  describe("scope: note", () => {
    it("returns a bare .md file with frontmatter and the body", async () => {
      const noteId = await makeNote("My Note", "Hello world.", null);
      await tagNote(noteId, "work");

      const result = await buildNotesExport(user.client, user.userId, { type: "note", id: noteId });

      expect(result?.filename).toBe("My Note.md");
      expect(result?.contentType).toContain("text/markdown");

      const { frontmatter, body } = parseNoteFile(result!.data.toString("utf-8"), "fallback");
      expect(frontmatter.title).toBe("My Note");
      expect(frontmatter.tags).toEqual(["work"]);
      expect(body).toBe("Hello world.");
    });

    it("returns null for another user's note", async () => {
      const noteId = await makeNote("Not Yours", "body", null);
      const other = await createSignedInUser(`export-notes-other-${Date.now()}-${Math.random()}@example.com`, "test-password-123");

      const result = await buildNotesExport(other.client, other.userId, { type: "note", id: noteId });
      expect(result).toBeNull();
    });

    it("returns null for a nonexistent note id", async () => {
      const result = await buildNotesExport(user.client, user.userId, {
        type: "note",
        id: "00000000-0000-0000-0000-000000000000",
      });
      expect(result).toBeNull();
    });
  });

  describe("scope: folder", () => {
    it("zips a folder's notes and nested subfolders, preserving structure", async () => {
      const work = await makeFolder("Work", null);
      const projects = await makeFolder("Projects", work);
      await makeNote("Top Level", "top body", work);
      await makeNote("Nested", "nested body", projects);

      const result = await buildNotesExport(user.client, user.userId, { type: "folder", id: work });
      expect(result?.filename).toBe("Work.zip");

      const zip = await JSZip.loadAsync(result!.data);
      const paths = filePaths(zip);
      expect(paths).toEqual(["Projects/Nested.md", "Top Level.md"]);

      const nestedContent = await zip.file("Projects/Nested.md")!.async("string");
      const { body } = parseNoteFile(nestedContent, "fallback");
      expect(body).toBe("nested body");
    });

    it("returns null for another user's folder", async () => {
      const folderId = await makeFolder("Not Yours", null);
      const other = await createSignedInUser(`export-notes-other-${Date.now()}-${Math.random()}@example.com`, "test-password-123");

      const result = await buildNotesExport(other.client, other.userId, { type: "folder", id: folderId });
      expect(result).toBeNull();
    });

    it("suffixes colliding filenames within the same directory", async () => {
      const folder = await makeFolder("Dupes", null);
      await makeNote("Same Title", "first", folder);
      await makeNote("Same Title", "second", folder);

      const result = await buildNotesExport(user.client, user.userId, { type: "folder", id: folder });
      const zip = await JSZip.loadAsync(result!.data);
      expect(filePaths(zip)).toEqual(["Same Title-2.md", "Same Title.md"]);
    });
  });

  describe("scope: all", () => {
    it("includes every folder and root-level note for the user", async () => {
      const folder = await makeFolder("Folder", null);
      await makeNote("In Folder", "body", folder);
      await makeNote("At Root", "body", null);

      const result = await buildNotesExport(user.client, user.userId, { type: "all" });
      expect(result?.filename).toBe("notes-export.zip");

      const zip = await JSZip.loadAsync(result!.data);
      expect(filePaths(zip)).toEqual(["At Root.md", "Folder/In Folder.md"]);
    });

    it("never includes another user's notes", async () => {
      await makeNote("Mine", "body", null);
      const other = await createSignedInUser(`export-notes-other-${Date.now()}-${Math.random()}@example.com`, "test-password-123");

      const result = await buildNotesExport(other.client, other.userId, { type: "all" });
      const zip = await JSZip.loadAsync(result!.data);
      expect(filePaths(zip)).toEqual([]);
    });
  });
});
