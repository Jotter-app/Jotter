import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { QuickAddBar } from "@/components/tasks/QuickAddBar";
import { TaskRow } from "@/components/tasks/TaskRow";
import { TagFilterRow } from "@/components/tags/TagFilterRow";
import { groupTasksByDueDate } from "@/lib/tasks/groupTasksByDueDate";

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const { tag: tagFilter } = await searchParams;
  const supabase = await createClient();

  const [{ data: tasks }, { data: tags }, { data: taggables }, { data: allNotes }, { data: taskNoteLinks }] =
    await Promise.all([
      supabase.from("tasks").select().order("due_at", { ascending: true, nullsFirst: false }),
      supabase.from("tags").select().order("name"),
      supabase.from("taggables").select("tag_id, taggable_id, tags(*)").eq("taggable_type", "task"),
      supabase.from("notes").select("id, title").order("title"),
      supabase.from("task_note_links").select("task_id, notes(id, title)"),
    ]);

  const allTags = tags ?? [];

  const tagsByTaskId = new Map<string, typeof allTags>();
  for (const row of taggables ?? []) {
    if (!row.tags) continue;
    const existing = tagsByTaskId.get(row.taggable_id) ?? [];
    existing.push(row.tags);
    tagsByTaskId.set(row.taggable_id, existing);
  }

  const linkedNotesByTaskId = new Map<string, { id: string; title: string }[]>();
  for (const row of taskNoteLinks ?? []) {
    if (!row.notes) continue;
    const existing = linkedNotesByTaskId.get(row.task_id) ?? [];
    existing.push(row.notes);
    linkedNotesByTaskId.set(row.task_id, existing);
  }

  let rows = tasks ?? [];
  if (typeof tagFilter === "string") {
    const taskIdsWithTag = new Set(
      (taggables ?? []).filter((r) => r.tag_id === tagFilter).map((r) => r.taggable_id)
    );
    rows = rows.filter((t) => taskIdsWithTag.has(t.id));
  }

  const active = rows.filter((t) => t.completed_at === null);
  const completed = rows.filter((t) => t.completed_at !== null);

  const { overdue, today, thisWeek, nextWeek, thisMonth, laterCount, noDueDate } = groupTasksByDueDate(active);

  // A restrained accent per section: overdue earns urgency (destructive),
  // today earns the app's one accent color, the rest stay neutral.
  const sections = [
    { title: "Overdue", tasks: overdue, dot: "bg-destructive", ring: "ring-destructive/20" },
    { title: "Today", tasks: today, dot: "bg-primary", ring: "ring-primary/20" },
    { title: "This Week", tasks: thisWeek, dot: "bg-muted-foreground/50", ring: "ring-transparent" },
    { title: "Next Week", tasks: nextWeek, dot: "bg-muted-foreground/50", ring: "ring-transparent" },
    { title: "This Month", tasks: thisMonth, dot: "bg-muted-foreground/50", ring: "ring-transparent" },
    { title: "No due date", tasks: noDueDate, dot: "bg-muted-foreground/50", ring: "ring-transparent" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <QuickAddBar />
        <TagFilterRow allTags={allTags} activeTagId={typeof tagFilter === "string" ? tagFilter : undefined} />
      </div>

      {sections.map(
        (section) =>
          section.tasks.length > 0 && (
            <section
              key={section.title}
              className={`rounded-xl border bg-card p-4 shadow-sm ring-1 ${section.ring}`}
            >
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span className={`size-2 rounded-full ${section.dot}`} />
                {section.title}
                <span className="font-normal text-muted-foreground">{section.tasks.length}</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {section.tasks.map((task) => (
                  <TaskRow
                    key={`${task.id}-${task.updated_at}`}
                    task={task}
                    allTags={allTags}
                    assignedTags={tagsByTaskId.get(task.id) ?? []}
                    allNotes={allNotes ?? []}
                    linkedNotes={linkedNotesByTaskId.get(task.id) ?? []}
                  />
                ))}
              </ul>
            </section>
          )
      )}

      {active.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No tasks yet -- add one above.
        </p>
      )}

      {laterCount > 0 && (
        <Link
          href="/calendar"
          className="rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {laterCount} more {laterCount === 1 ? "task" : "tasks"} &middot; view on calendar
        </Link>
      )}

      {completed.length > 0 && (
        <details className="group rounded-xl border bg-card p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground marker:content-none">
            <span className="inline-flex items-center gap-1.5">
              <span className="transition-transform group-open:rotate-90">&rsaquo;</span>
              Completed
              <span className="font-normal">{completed.length}</span>
            </span>
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {completed.map((task) => (
              <TaskRow
                key={`${task.id}-${task.updated_at}`}
                task={task}
                allTags={allTags}
                assignedTags={tagsByTaskId.get(task.id) ?? []}
                allNotes={allNotes ?? []}
                linkedNotes={linkedNotesByTaskId.get(task.id) ?? []}
              />
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
