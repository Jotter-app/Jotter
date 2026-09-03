import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { QuickAddBar } from "@/components/tasks/QuickAddBar";
import { TaskRow } from "@/components/tasks/TaskRow";
import { ArchivedTaskRow } from "@/components/tasks/ArchivedTaskRow";
import { ArchiveCompletedButton } from "@/components/tasks/ArchiveCompletedButton";
import { TagFilterRow } from "@/components/tags/TagFilterRow";
import { groupTasksByDueDate } from "@/lib/tasks/groupTasksByDueDate";
import { getHideNoteOnlyTags } from "@/lib/actions/settings";
import { filterNoteOnlyTags } from "@/lib/tags/filterNoteOnlyTags";
import { getUserTimeZone } from "@/lib/dates/getUserTimeZone";

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const { tag: tagFilter } = await searchParams;
  const supabase = await createClient();
  const timeZone = await getUserTimeZone();

  const [
    { data: tasks },
    { data: tags },
    { data: taggables },
    { data: allNotes },
    { data: taskNoteLinks },
    { data: subtasks },
    hideNoteOnlyTags,
  ] = await Promise.all([
    // Top-level only -- subtasks render nested under their parent (below),
    // not as their own independent entries in the due-date-grouped sections.
    supabase
      .from("tasks")
      .select()
      .is("parent_task_id", null)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("tags").select().order("name"),
    supabase.from("taggables").select("tag_id, taggable_id, tags(*)").eq("taggable_type", "task"),
    supabase.from("notes").select("id, title").order("title"),
    supabase.from("task_note_links").select("task_id, notes(id, title, body_markdown, updated_at)"),
    supabase.from("tasks").select().not("parent_task_id", "is", null),
    getHideNoteOnlyTags(),
  ]);

  const subtasksByTaskId = new Map<string, NonNullable<typeof subtasks>>();
  for (const subtask of subtasks ?? []) {
    if (!subtask.parent_task_id) continue;
    const existing = subtasksByTaskId.get(subtask.parent_task_id) ?? [];
    existing.push(subtask);
    subtasksByTaskId.set(subtask.parent_task_id, existing);
  }

  const allTags = filterNoteOnlyTags(tags ?? [], taggables ?? [], hideNoteOnlyTags);

  const tagsByTaskId = new Map<string, typeof allTags>();
  for (const row of taggables ?? []) {
    if (!row.tags) continue;
    const existing = tagsByTaskId.get(row.taggable_id) ?? [];
    existing.push(row.tags);
    tagsByTaskId.set(row.taggable_id, existing);
  }

  const linkedNotesByTaskId = new Map<
    string,
    { id: string; title: string; body_markdown: string; updated_at: string }[]
  >();
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
  const completed = rows.filter((t) => t.completed_at !== null && t.archived_at === null);
  const archived = rows.filter((t) => t.archived_at !== null);

  const { overdue, today, thisWeek, nextWeek, thisMonth, laterCount, noDueDate } = groupTasksByDueDate(
    active,
    timeZone
  );

  // A restrained accent per section: overdue earns a deeper accent shade
  // for urgency, today earns the app's primary accent color, the rest
  // stay neutral.
  const sections = [
    { title: "Overdue", tasks: overdue, dot: "bg-accent-700", ring: "ring-accent-700/20" },
    { title: "Today", tasks: today, dot: "bg-primary", ring: "ring-primary/20" },
    { title: "This Week", tasks: thisWeek, dot: "bg-muted-foreground/50", ring: "ring-transparent" },
    { title: "Next Week", tasks: nextWeek, dot: "bg-muted-foreground/50", ring: "ring-transparent" },
    { title: "This Month", tasks: thisMonth, dot: "bg-muted-foreground/50", ring: "ring-transparent" },
    { title: "No due date", tasks: noDueDate, dot: "bg-muted-foreground/50", ring: "ring-transparent" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <h1 className="font-heading text-2xl tracking-tight">Tasks</h1>

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <QuickAddBar />
        <TagFilterRow allTags={allTags} activeTagId={typeof tagFilter === "string" ? tagFilter : undefined} />
      </div>

      {sections.map(
        (section) =>
          section.tasks.length > 0 && (
            <section
              key={section.title}
              className={`rounded-2xl border bg-card p-4 shadow-sm ring-1 ${section.ring}`}
            >
              <h2 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold">
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
                    subtasks={subtasksByTaskId.get(task.id) ?? []}
                  />
                ))}
              </ul>
            </section>
          )
      )}

      {active.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-accent-100 text-2xl">✓</span>
          <p className="text-sm text-muted-foreground">No tasks yet -- add one above.</p>
        </div>
      )}

      {laterCount > 0 && (
        <Link
          href="/calendar"
          className="rounded-2xl border border-dashed p-3 text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {laterCount} more {laterCount === 1 ? "task" : "tasks"} &middot; view on calendar
        </Link>
      )}

      {completed.length > 0 && (
        <details className="group rounded-2xl border bg-card p-4 shadow-sm">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-muted-foreground marker:content-none">
            <span className="inline-flex items-center gap-1.5">
              <span className="transition-transform group-open:rotate-90">&rsaquo;</span>
              Completed
              <span className="font-normal">{completed.length}</span>
            </span>
            <ArchiveCompletedButton />
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
                subtasks={subtasksByTaskId.get(task.id) ?? []}
              />
            ))}
          </ul>
        </details>
      )}

      {archived.length > 0 && (
        <details className="group rounded-2xl border bg-card p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground marker:content-none">
            <span className="inline-flex items-center gap-1.5">
              <span className="transition-transform group-open:rotate-90">&rsaquo;</span>
              Archived
              <span className="font-normal">{archived.length}</span>
            </span>
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {archived.map((task) => (
              <ArchivedTaskRow key={`${task.id}-${task.updated_at}`} task={task} />
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
