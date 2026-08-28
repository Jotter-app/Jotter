import Link from "next/link";
import { Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buildFolderTree, collectNotesInSubtree } from "@/lib/notes/tree";
import { NotesTree } from "@/components/notes/NotesTree";
import { ExportLink } from "@/components/notes/ExportLink";
import { ImportNotesButton } from "@/components/notes/ImportNotesButton";
import { NoteTagsSection } from "@/components/notes/NoteTagsSection";
import { NotesDashboard, type NoteGroup } from "@/components/notes/NotesDashboard";
import type { NoteCardData } from "@/components/notes/NoteCard";

type NoteWithMeta = {
  id: string;
  title: string;
  folder_id: string | null;
  body_markdown: string;
  updated_at: string;
};

export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const { folder: folderFilter } = await searchParams;
  const supabase = await createClient();

  const [{ data: folders }, { data: notes }, { data: noteTaggables }] = await Promise.all([
    supabase.from("folders").select().order("name"),
    supabase.from("notes").select("id, title, folder_id, body_markdown, updated_at").order("title"),
    supabase.from("taggables").select("taggable_id, tags(*)").eq("taggable_type", "note"),
  ]);

  const notesWithMeta: NoteWithMeta[] = notes ?? [];
  const { roots, rootNotes } = buildFolderTree(folders ?? [], notesWithMeta);

  const tagsByNoteId = new Map<string, { id: string; name: string }[]>();
  const noteTagsById = new Map<string, NonNullable<NonNullable<typeof noteTaggables>[number]["tags"]>>();
  for (const row of noteTaggables ?? []) {
    if (!row.tags) continue;
    noteTagsById.set(row.tags.id, row.tags);
    const existing = tagsByNoteId.get(row.taggable_id) ?? [];
    existing.push({ id: row.tags.id, name: row.tags.name });
    tagsByNoteId.set(row.taggable_id, existing);
  }
  const noteTags = Array.from(noteTagsById.values()).sort((a, b) => a.name.localeCompare(b.name));

  function toCardData(note: NoteWithMeta, notebookName: string): NoteCardData {
    return {
      id: note.id,
      title: note.title,
      bodyMarkdown: note.body_markdown,
      updatedAt: note.updated_at,
      notebookName,
      tags: tagsByNoteId.get(note.id) ?? [],
    };
  }

  let groups: NoteGroup[] = roots.map((root) => ({
    id: root.id,
    name: root.name,
    notes: collectNotesInSubtree(root).map((note) => toCardData(note, root.name)),
  }));
  if (rootNotes.length > 0) {
    groups.push({ id: null, name: "Unfiled", notes: rootNotes.map((note) => toCardData(note, "Unfiled")) });
  }
  if (typeof folderFilter === "string") {
    groups = groups.filter((group) => group.id === folderFilter);
  }

  return (
    <div className="flex flex-1">
      <aside className="hidden w-64 shrink-0 flex-col gap-5 overflow-auto border-r bg-muted/40 p-4 md:flex">
        <div className="flex flex-col gap-1">
          <Link
            href="/notes"
            className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${
              !folderFilter ? "bg-accent-100 text-accent-800" : "hover:bg-accent/40"
            }`}
          >
            All notes
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Notebooks</span>
            <Link href="/notes/manage" aria-label="Manage notebooks & tags" className="text-muted-foreground hover:text-foreground">
              <Settings2 className="size-3.5" />
            </Link>
          </div>
          <NotesTree roots={roots} rootNotes={rootNotes} activeFolderId={typeof folderFilter === "string" ? folderFilter : undefined} />
        </div>
        <NoteTagsSection tags={noteTags} />
        <div className="mt-auto flex flex-col gap-2 border-t pt-3">
          <div className="flex items-center gap-1">
            <ExportLink scope={{ type: "all" }} />
            <ImportNotesButton />
          </div>
        </div>
      </aside>
      <NotesDashboard groups={groups} />
    </div>
  );
}
