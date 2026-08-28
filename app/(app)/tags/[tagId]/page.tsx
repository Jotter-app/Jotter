import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";

// taggables has no FK to notes/tasks/events (it's polymorphic -- see its
// migration), so this can't be a nested select off taggables; the taggable
// ids are fetched first, then each pillar is queried separately with them.
export default async function TagPage({ params }: PageProps<"/tags/[tagId]">) {
  const { tagId } = await params;
  const supabase = await createClient();

  const { data: tag } = await supabase.from("tags").select().eq("id", tagId).maybeSingle();
  if (!tag) notFound();

  const { data: taggables } = await supabase.from("taggables").select("taggable_id, taggable_type").eq("tag_id", tagId);

  const noteIds = (taggables ?? []).filter((t) => t.taggable_type === "note").map((t) => t.taggable_id);
  const taskIds = (taggables ?? []).filter((t) => t.taggable_type === "task").map((t) => t.taggable_id);
  const eventIds = (taggables ?? []).filter((t) => t.taggable_type === "event").map((t) => t.taggable_id);

  const [{ data: notes }, { data: tasks }, { data: events }] = await Promise.all([
    noteIds.length
      ? supabase.from("notes").select("id, title").in("id", noteIds).order("title")
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    taskIds.length
      ? supabase.from("tasks").select("id, title, completed_at").in("id", taskIds).order("title")
      : Promise.resolve({ data: [] as { id: string; title: string; completed_at: string | null }[] }),
    eventIds.length
      ? supabase.from("events").select("id, title, start_at").in("id", eventIds).order("start_at")
      : Promise.resolve({ data: [] as { id: string; title: string; start_at: string }[] }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <Link href="/tags" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to tags
      </Link>
      <h1 className="font-heading text-2xl">#{tag.name}</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase">Notes</h2>
        {notes && notes.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {notes.map((note) => (
              <li key={note.id}>
                <Link href={`/notes/${note.id}`} className="text-sm text-primary hover:underline">
                  {note.title || "Untitled"}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing tagged yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase">Tasks</h2>
        {tasks && tasks.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href="/tasks"
                  className={task.completed_at ? "text-sm text-muted-foreground line-through" : "text-sm text-primary hover:underline"}
                >
                  {task.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing tagged yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase">Events</h2>
        {events && events.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {events.map((event) => (
              <li key={event.id} className="text-sm">
                <Link href="/calendar" className="text-primary hover:underline">
                  {event.title}
                </Link>{" "}
                <span className="text-muted-foreground">{format(new Date(event.start_at), "MMM d, h:mm a")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing tagged yet.</p>
        )}
      </section>
    </main>
  );
}
