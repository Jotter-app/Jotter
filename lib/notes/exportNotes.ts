import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFolderTree, type FolderNode } from "@/lib/notes/tree";
import { serializeNoteFrontmatter } from "@/lib/notes/noteFrontmatter";
import { sanitizeFilename, uniqueFilename } from "@/lib/notes/exportFilename";
import type { Database } from "@/lib/supabase/database.types";

type Note = Database["public"]["Tables"]["notes"]["Row"];
type NoteSummary = { id: string; title: string; folder_id: string | null };

export type ExportScope = { type: "all" } | { type: "folder"; id: string } | { type: "note"; id: string };

export interface NotesExportResult {
  filename: string;
  data: Buffer;
  contentType: string;
}

async function fetchTagNamesByNoteId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Map<string, string[]>> {
  const { data } = await supabase
    .from("taggables")
    .select("taggable_id, tags(name)")
    .eq("taggable_type", "note")
    .eq("user_id", userId);

  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    if (!row.tags) continue;
    const existing = map.get(row.taggable_id) ?? [];
    existing.push(row.tags.name);
    map.set(row.taggable_id, existing);
  }
  return map;
}

function noteToFileContent(note: Note, tags: string[]): string {
  return serializeNoteFrontmatter(
    { title: note.title, tags, createdAt: note.created_at, updatedAt: note.updated_at },
    note.body_markdown
  );
}

async function buildSingleNoteExport(
  supabase: SupabaseClient<Database>,
  userId: string,
  noteId: string
): Promise<NotesExportResult | null> {
  const { data: note } = await supabase.from("notes").select().eq("id", noteId).eq("user_id", userId).maybeSingle();
  if (!note) return null;

  const { data: taggableRows } = await supabase
    .from("taggables")
    .select("tags(name)")
    .eq("taggable_type", "note")
    .eq("taggable_id", noteId);
  const tags = (taggableRows ?? []).flatMap((row) => (row.tags ? [row.tags.name] : []));

  return {
    filename: `${sanitizeFilename(note.title)}.md`,
    data: Buffer.from(noteToFileContent(note, tags), "utf-8"),
    contentType: "text/markdown; charset=utf-8",
  };
}

// Writes a folder's own direct notes into the zip at `dirPath`, then
// recurses into its child folders -- collision-suffixing filenames only
// within this one directory's listing, since that's the actual constraint
// (a zip directory can't hold two same-named files, even though two notes
// in this app can share a title).
function addFolderToZip(
  zip: JSZip,
  notes: NoteSummary[],
  children: FolderNode[],
  noteById: Map<string, Note>,
  tagsByNoteId: Map<string, string[]>,
  dirPath: string
) {
  const usedNames = new Set<string>();
  for (const summary of notes) {
    const note = noteById.get(summary.id);
    if (!note) continue;
    const filename = uniqueFilename(sanitizeFilename(note.title), usedNames);
    zip.file(`${dirPath}${filename}`, noteToFileContent(note, tagsByNoteId.get(note.id) ?? []));
  }
  for (const child of children) {
    addFolderToZip(zip, child.notes, child.children, noteById, tagsByNoteId, `${dirPath}${sanitizeFilename(child.name)}/`);
  }
}

function findFolderNode(roots: FolderNode[], id: string): FolderNode | null {
  for (const node of roots) {
    if (node.id === id) return node;
    const found = findFolderNode(node.children, id);
    if (found) return found;
  }
  return null;
}

async function buildZipExport(
  supabase: SupabaseClient<Database>,
  userId: string,
  scope: { type: "all" } | { type: "folder"; id: string }
): Promise<NotesExportResult | null> {
  const [{ data: folders }, { data: notes }] = await Promise.all([
    supabase.from("folders").select().eq("user_id", userId),
    supabase.from("notes").select().eq("user_id", userId),
  ]);
  const allNotes = notes ?? [];
  const noteById = new Map(allNotes.map((note) => [note.id, note]));
  const tagsByNoteId = await fetchTagNamesByNoteId(supabase, userId);

  const { roots, rootNotes } = buildFolderTree(folders ?? [], allNotes);

  const zip = new JSZip();
  let zipLabel: string;

  if (scope.type === "all") {
    addFolderToZip(zip, rootNotes, roots, noteById, tagsByNoteId, "");
    zipLabel = "notes-export";
  } else {
    const target = findFolderNode(roots, scope.id);
    if (!target) return null;
    addFolderToZip(zip, target.notes, target.children, noteById, tagsByNoteId, "");
    zipLabel = sanitizeFilename(target.name);
  }

  const data = await zip.generateAsync({ type: "nodebuffer" });
  return { filename: `${zipLabel}.zip`, data, contentType: "application/zip" };
}

// Owner-scoped throughout (every query filters by user_id, and a folder/
// note id belonging to another user simply never appears in this user's
// fetched tree or single-row lookup) -- returns null uniformly for "not
// found" and "not yours," same as any other owner-scoped lookup in this
// app; the caller turns that into a 404.
export async function buildNotesExport(
  supabase: SupabaseClient<Database>,
  userId: string,
  scope: ExportScope
): Promise<NotesExportResult | null> {
  if (scope.type === "note") {
    return buildSingleNoteExport(supabase, userId, scope.id);
  }
  return buildZipExport(supabase, userId, scope);
}
