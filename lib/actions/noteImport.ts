"use server";

import { revalidatePath } from "next/cache";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import { insertNoteCore } from "@/lib/actions/notes";
import { syncNoteLinksCore } from "@/lib/actions/noteLinks";
import { findOrCreateTag } from "@/lib/tags/findOrCreateTag";
import { parseNoteFile } from "@/lib/notes/noteFrontmatter";
import { createFolderPathCache, resolveFolderPath } from "@/lib/notes/resolveFolderPath";
import type { Database } from "@/lib/supabase/database.types";

export interface ImportNotesResult {
  ok: boolean;
  imported: number;
  error: string | null;
}

interface FileEntry {
  // A zip entry's own internal path (e.g. "Work/Projects/Note.md"), or
  // just a loose upload's filename (e.g. "Note.md") -- either way, the
  // directory segments (if any) become the folder path to resolve.
  path: string;
  content: string;
}

async function expandUploadedFiles(files: File[]): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  for (const file of files) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      for (const [path, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir || !path.toLowerCase().endsWith(".md")) continue;
        entries.push({ path, content: await zipEntry.async("string") });
      }
    } else if (lowerName.endsWith(".md")) {
      entries.push({ path: file.name, content: await file.text() });
    }
  }
  return entries;
}

// Core logic factored out (same seam as deleteFolderCore/buildNotesExport)
// so it's callable directly from integration tests, which can't go through
// currentUserId() -- it depends on next/headers' cookies().
//
// Notes always import as new rows (titles aren't unique in this app) --
// folders are the only thing matched/reused by path, via resolveFolderPath.
export async function importNotesCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  files: File[]
): Promise<ImportNotesResult> {
  const entries = await expandUploadedFiles(files);

  const folderCache = createFolderPathCache();
  const createdNoteIds: string[] = [];

  for (const entry of entries) {
    const segments = entry.path.split("/").filter(Boolean);
    const filename = segments.pop();
    if (!filename) continue;
    const fallbackTitle = filename.replace(/\.md$/i, "");

    const folderId = await resolveFolderPath(supabase, userId, segments, folderCache);
    const { frontmatter, body } = parseNoteFile(entry.content, fallbackTitle);

    const result = await insertNoteCore(supabase, userId, {
      folderId,
      title: frontmatter.title ?? fallbackTitle,
      bodyMarkdown: body,
      createdAt: frontmatter.createdAt ?? undefined,
      updatedAt: frontmatter.updatedAt ?? undefined,
    });
    if (!result.ok || !result.noteId) continue;
    createdNoteIds.push(result.noteId);

    // Tags come from frontmatter here, not extractTags on the body --
    // frontmatter is the authoritative source for an imported note, same
    // as it's the lossless round-trip source for export.
    for (const tagName of frontmatter.tags) {
      const tagId = await findOrCreateTag(supabase, userId, tagName);
      if (!tagId) continue;
      await supabase
        .from("taggables")
        .upsert(
          { tag_id: tagId, user_id: userId, taggable_id: result.noteId, taggable_type: "note" },
          { onConflict: "tag_id,taggable_id,taggable_type", ignoreDuplicates: true }
        );
    }
  }

  // Second pass, after every note in this batch exists: resolve
  // [[wikilinks]]. A note earlier in the zip may link to one created
  // later -- this is what makes that resolve regardless of file order.
  for (const noteId of createdNoteIds) {
    const { data: note } = await supabase.from("notes").select("body_markdown").eq("id", noteId).single();
    if (note) await syncNoteLinksCore(supabase, userId, noteId, note.body_markdown);
  }

  return { ok: true, imported: createdNoteIds.length, error: null };
}

export async function importNotes(formData: FormData): Promise<ImportNotesResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, imported: 0, error: "Not signed in." };

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  const result = await importNotesCore(supabase, userId, files);

  if (result.imported > 0) revalidatePath("/notes");
  return result;
}
