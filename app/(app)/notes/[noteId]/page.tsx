import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { folderBreadcrumb } from "@/lib/notes/folderBreadcrumb";

export default async function NotePage({ params }: PageProps<"/notes/[noteId]">) {
  const { noteId } = await params;
  const supabase = await createClient();

  const [
    { data: note },
    { data: tags },
    { data: taggables },
    { data: allTasks },
    { data: taskNoteLinks },
    { data: allNoteTitles },
    { data: noteLinks },
    { data: folders },
    { data: taskTaggables },
    { data: noteTaggables },
    { data: allEvents },
    { data: eventTaggables },
  ] = await Promise.all([
    supabase.from("notes").select().eq("id", noteId).maybeSingle(),
    supabase.from("tags").select().order("name"),
    supabase
      .from("taggables")
      .select("tags(*)")
      .eq("taggable_type", "note")
      .eq("taggable_id", noteId),
    supabase.from("tasks").select("id, title, completed_at, due_at, priority").order("title"),
    supabase
      .from("task_note_links")
      .select("tasks(id, title, completed_at, due_at, priority)")
      .eq("note_id", noteId),
    supabase.from("notes").select("id, title, updated_at").order("title"),
    supabase
      .from("note_links")
      .select("notes!note_links_source_note_id_fkey(id, title)")
      .eq("target_note_id", noteId),
    supabase.from("folders").select("id, name, parent_folder_id"),
    // Every task's/note's tags, unscoped by id -- powers embedded queries
    // (?tasks #tag / ?notes #tag), which can reference any of the user's
    // tasks or notes, not just ones already linked to this one. taggables
    // has no FK to tasks/notes (see its migration), so this has to be a
    // separate query joined client-side, same as the Tasks page's
    // tagsByTaskId construction -- not a nested select off tasks/notes.
    supabase.from("taggables").select("taggable_id, tags(name)").eq("taggable_type", "task"),
    supabase.from("taggables").select("taggable_id, tags(name)").eq("taggable_type", "note"),
    // ?events #tag / ?events due:today (Tier 3) needs the same kind of
    // full, unscoped snapshot as queryableTasks/queryableNotes above.
    supabase.from("events").select("id, title, start_at").order("start_at"),
    supabase.from("taggables").select("taggable_id, tags(name)").eq("taggable_type", "event"),
  ]);

  if (!note) {
    notFound();
  }

  const assignedTags = (taggables ?? []).flatMap((row) => (row.tags ? [row.tags] : []));
  const linkedTasks = (taskNoteLinks ?? []).flatMap((row) => (row.tasks ? [row.tasks] : []));
  const backlinks = (noteLinks ?? []).flatMap((row) => (row.notes ? [row.notes] : []));
  const breadcrumb = folderBreadcrumb(folders ?? [], note.folder_id);

  const tagNamesByTaskId = new Map<string, string[]>();
  for (const row of taskTaggables ?? []) {
    if (!row.tags) continue;
    const existing = tagNamesByTaskId.get(row.taggable_id) ?? [];
    existing.push(row.tags.name);
    tagNamesByTaskId.set(row.taggable_id, existing);
  }

  const tagNamesByNoteId = new Map<string, string[]>();
  for (const row of noteTaggables ?? []) {
    if (!row.tags) continue;
    const existing = tagNamesByNoteId.get(row.taggable_id) ?? [];
    existing.push(row.tags.name);
    tagNamesByNoteId.set(row.taggable_id, existing);
  }

  const queryableTasks = (allTasks ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    completed_at: task.completed_at,
    due_at: task.due_at,
    tags: tagNamesByTaskId.get(task.id) ?? [],
  }));

  const queryableNotes = (allNoteTitles ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    tags: tagNamesByNoteId.get(n.id) ?? [],
  }));

  const tagNamesByEventId = new Map<string, string[]>();
  for (const row of eventTaggables ?? []) {
    if (!row.tags) continue;
    const existing = tagNamesByEventId.get(row.taggable_id) ?? [];
    existing.push(row.tags.name);
    tagNamesByEventId.set(row.taggable_id, existing);
  }

  const queryableEvents = (allEvents ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    start_at: event.start_at,
    tags: tagNamesByEventId.get(event.id) ?? [],
  }));

  return (
    <div className="flex w-full flex-col">
      <div className="border-b bg-card px-6 py-3">
        <Link
          href="/notes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to notes
        </Link>
      </div>
      <NoteEditor
        key={note.updated_at}
        note={note}
        allTags={tags ?? []}
        assignedTags={assignedTags}
        allTasks={allTasks ?? []}
        linkedTasks={linkedTasks}
        allNoteTitles={allNoteTitles ?? []}
        backlinks={backlinks}
        breadcrumb={breadcrumb}
        queryableTasks={queryableTasks}
        queryableNotes={queryableNotes}
        queryableEvents={queryableEvents}
      />
    </div>
  );
}
