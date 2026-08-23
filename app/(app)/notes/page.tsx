import { createClient } from "@/lib/supabase/server";
import { buildFolderTree } from "@/lib/notes/tree";
import { NotesTree } from "@/components/notes/NotesTree";

export default async function NotesPage() {
  const supabase = await createClient();

  const [{ data: folders }, { data: notes }] = await Promise.all([
    supabase.from("folders").select().order("name"),
    supabase.from("notes").select("id, title, folder_id").order("title"),
  ]);

  const { roots, rootNotes } = buildFolderTree(folders ?? [], notes ?? []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <NotesTree roots={roots} rootNotes={rootNotes} />
      </div>
    </main>
  );
}
