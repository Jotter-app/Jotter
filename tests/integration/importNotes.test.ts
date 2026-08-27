import { beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { importNotesCore } from "@/lib/actions/noteImport";
import { serializeNoteFrontmatter } from "@/lib/notes/noteFrontmatter";

// Requires a running local Supabase stack (`supabase start`). Exercises
// importNotesCore directly (rather than the exported importNotes action)
// since that wrapper calls currentUserId(), which depends on
// next/headers' cookies() and only works inside an actual Next.js request.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: "text/markdown" });
}

async function makeZipFile(name: string, entries: Record<string, string>): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new File([new Uint8Array(buffer)], name, { type: "application/zip" });
}

describe("importNotesCore", () => {
  let user: { client: SupabaseClient; userId: string };

  beforeEach(async () => {
    user = await createSignedInUser(`import-notes-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
  });

  it("creates folders from a zip's nested directory structure", async () => {
    const zip = await makeZipFile("vault.zip", {
      "Work/Projects/Nested.md": "No frontmatter, just body.",
      "At Root.md": "Root body.",
    });

    const result = await importNotesCore(user.client, user.userId, [zip]);
    expect(result).toEqual({ ok: true, imported: 2, error: null });

    const { data: nested } = await user.client.from("notes").select("title, body_markdown, folder_id").eq("title", "Nested").single();
    expect(nested?.body_markdown).toBe("No frontmatter, just body.");

    const { data: projectsFolder } = await user.client.from("folders").select("name, parent_folder_id").eq("id", nested!.folder_id!).single();
    expect(projectsFolder?.name).toBe("Projects");

    const { data: workFolder } = await user.client.from("folders").select("name, parent_folder_id").eq("id", projectsFolder!.parent_folder_id!).single();
    expect(workFolder?.name).toBe("Work");
    expect(workFolder?.parent_folder_id).toBeNull();

    const { data: atRoot } = await user.client.from("notes").select("folder_id").eq("title", "At Root").single();
    expect(atRoot?.folder_id).toBeNull();
  });

  it("restores tags and original timestamps from frontmatter", async () => {
    const content = serializeNoteFrontmatter(
      { title: "Restored", tags: ["work", "urgent"], createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-06-01T00:00:00.000Z" },
      "Body text."
    );
    const zip = await makeZipFile("vault.zip", { "Restored.md": content });

    const result = await importNotesCore(user.client, user.userId, [zip]);
    expect(result.imported).toBe(1);

    const { data: note } = await user.client
      .from("notes")
      .select("title, body_markdown, created_at, updated_at")
      .eq("title", "Restored")
      .single();
    expect(note?.body_markdown).toBe("Body text.");
    expect(new Date(note!.created_at).toISOString()).toBe("2020-01-01T00:00:00.000Z");
    expect(new Date(note!.updated_at).toISOString()).toBe("2020-06-01T00:00:00.000Z");

    const { data: taggables } = await user.client
      .from("taggables")
      .select("taggable_id, tags(name)")
      .eq("taggable_type", "note")
      .eq("user_id", user.userId);
    // The untyped test Supabase client (no <Database> generic, matching
    // every other integration test's createSignedInUser) can't infer this
    // join's cardinality, so `tags` may come through as an array or a
    // single object depending on that inference -- normalize both.
    const tagNames = (taggables ?? [])
      .flatMap((row) => (Array.isArray(row.tags) ? row.tags : row.tags ? [row.tags] : []))
      .map((tag) => tag.name)
      .sort();
    expect(tagNames).toEqual(["urgent", "work"]);
  });

  it("resolves [[wikilinks]] between two notes in the same batch regardless of file order", async () => {
    const zip = await makeZipFile("vault.zip", {
      "A.md": serializeNoteFrontmatter({ title: "A", tags: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }, "Links to [[B]]."),
      "B.md": serializeNoteFrontmatter({ title: "B", tags: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }, "Links to [[A]]."),
    });

    const result = await importNotesCore(user.client, user.userId, [zip]);
    expect(result.imported).toBe(2);

    const { data: noteA } = await user.client.from("notes").select("id").eq("title", "A").single();
    const { data: noteB } = await user.client.from("notes").select("id").eq("title", "B").single();

    const { data: linksFromA } = await user.client.from("note_links").select("target_note_id").eq("source_note_id", noteA!.id);
    expect(linksFromA).toEqual([{ target_note_id: noteB!.id }]);

    const { data: linksFromB } = await user.client.from("note_links").select("target_note_id").eq("source_note_id", noteB!.id);
    expect(linksFromB).toEqual([{ target_note_id: noteA!.id }]);
  });

  it("imports a loose .md file with no frontmatter at root, title from filename", async () => {
    const file = makeFile("Hand Written.md", "Just plain markdown, no frontmatter.");

    const result = await importNotesCore(user.client, user.userId, [file]);
    expect(result.imported).toBe(1);

    const { data: note } = await user.client.from("notes").select("title, body_markdown, folder_id").eq("title", "Hand Written").single();
    expect(note?.body_markdown).toBe("Just plain markdown, no frontmatter.");
    expect(note?.folder_id).toBeNull();
  });

  it("imports 0 notes from an empty zip without erroring", async () => {
    const zip = await makeZipFile("empty.zip", {});
    const result = await importNotesCore(user.client, user.userId, [zip]);
    expect(result).toEqual({ ok: true, imported: 0, error: null });
  });

  it("imports 0 notes from a zip with only non-.md entries", async () => {
    const zip = await makeZipFile("assets.zip", { "image.png": "not markdown" });
    const result = await importNotesCore(user.client, user.userId, [zip]);
    expect(result).toEqual({ ok: true, imported: 0, error: null });
  });

  it("never lets one user's import become visible to another", async () => {
    const other = await createSignedInUser(`import-notes-other-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
    const zip = await makeZipFile("vault.zip", { "Mine.md": "body" });

    await importNotesCore(user.client, user.userId, [zip]);

    const { data: otherUsersView } = await other.client.from("notes").select("id").eq("title", "Mine");
    expect(otherUsersView).toEqual([]);
  });
});
