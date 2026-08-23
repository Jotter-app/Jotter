import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NoteEditor } from "@/components/notes/NoteEditor";

export default async function NotePage({ params }: PageProps<"/notes/[noteId]">) {
  const { noteId } = await params;
  const supabase = await createClient();

  const [{ data: note }, { data: tags }, { data: taggables }] = await Promise.all([
    supabase.from("notes").select().eq("id", noteId).maybeSingle(),
    supabase.from("tags").select().order("name"),
    supabase
      .from("taggables")
      .select("tags(*)")
      .eq("taggable_type", "note")
      .eq("taggable_id", noteId),
  ]);

  if (!note) {
    notFound();
  }

  const assignedTags = (taggables ?? []).flatMap((row) => (row.tags ? [row.tags] : []));

  return (
    <div className="flex w-full flex-col">
      <div className="border-b px-6 py-3">
        <Link href="/notes" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to notes
        </Link>
      </div>
      <NoteEditor key={note.updated_at} note={note} allTags={tags ?? []} assignedTags={assignedTags} />
    </div>
  );
}
