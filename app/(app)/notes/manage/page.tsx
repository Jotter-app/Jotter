import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buildFolderTree } from "@/lib/notes/tree";
import { NotebookManageList } from "@/components/notes/NotebookManageList";
import { NoteTagsSection } from "@/components/notes/NoteTagsSection";

export default async function NotesManagePage() {
  const supabase = await createClient();

  const [{ data: folders }, { data: notes }, { data: noteTaggables }] = await Promise.all([
    supabase.from("folders").select().order("name"),
    supabase.from("notes").select("id, title, folder_id").order("title"),
    supabase.from("taggables").select("tags(*)").eq("taggable_type", "note"),
  ]);

  const { roots } = buildFolderTree(folders ?? [], notes ?? []);

  const noteTagsById = new Map<string, NonNullable<NonNullable<typeof noteTaggables>[number]["tags"]>>();
  for (const row of noteTaggables ?? []) {
    if (row.tags) noteTagsById.set(row.tags.id, row.tags);
  }
  const noteTags = Array.from(noteTagsById.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <Link href="/notes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to notes
      </Link>
      <h1 className="font-heading text-2xl">Notebooks</h1>
      <NotebookManageList roots={roots} />

      <div className="mt-2 rounded-2xl bg-card p-4 shadow-sm">
        <NoteTagsSection tags={noteTags} />
        {noteTags.length === 0 && <p className="text-sm text-muted-foreground">No note tags yet.</p>}
      </div>

      <Link href="/tags" className="text-sm text-primary hover:underline">
        Browse all tags &rarr;
      </Link>
    </main>
  );
}
