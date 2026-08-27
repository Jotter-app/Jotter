import { createClient } from "@/lib/supabase/server";
import { buildFolderTree } from "@/lib/notes/tree";
import { NotesTree } from "@/components/notes/NotesTree";
import { ExportLink } from "@/components/notes/ExportLink";
import { ImportNotesButton } from "@/components/notes/ImportNotesButton";
import { NoteTagsSection } from "@/components/notes/NoteTagsSection";

export default async function NotesPage() {
  const supabase = await createClient();

  const [{ data: folders }, { data: notes }, { data: noteTaggables }] = await Promise.all([
    supabase.from("folders").select().order("name"),
    supabase.from("notes").select("id, title, folder_id").order("title"),
    supabase.from("taggables").select("tags(*)").eq("taggable_type", "note"),
  ]);

  const { roots, rootNotes } = buildFolderTree(folders ?? [], notes ?? []);

  const noteTagsById = new Map<string, NonNullable<NonNullable<typeof noteTaggables>[number]["tags"]>>();
  for (const row of noteTaggables ?? []) {
    if (row.tags) noteTagsById.set(row.tags.id, row.tags);
  }
  const noteTags = Array.from(noteTagsById.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
        <div className="flex items-center gap-2">
          <ExportLink scope={{ type: "all" }} />
          <ImportNotesButton />
        </div>
      </div>
      <NoteTagsSection tags={noteTags} />
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <NotesTree roots={roots} rootNotes={rootNotes} />
      </div>
    </main>
  );
}
