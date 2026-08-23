import { startOfDay, endOfDay } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { QuickAddBar } from "@/components/tasks/QuickAddBar";
import { TaskRow } from "@/components/tasks/TaskRow";
import { TagFilterRow } from "@/components/tags/TagFilterRow";

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const { tag: tagFilter } = await searchParams;
  const supabase = await createClient();

  const [{ data: tasks }, { data: tags }, { data: taggables }] = await Promise.all([
    supabase.from("tasks").select().order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("tags").select().order("name"),
    supabase.from("taggables").select("tag_id, taggable_id, tags(*)").eq("taggable_type", "task"),
  ]);

  const allTags = tags ?? [];

  const tagsByTaskId = new Map<string, typeof allTags>();
  for (const row of taggables ?? []) {
    if (!row.tags) continue;
    const existing = tagsByTaskId.get(row.taggable_id) ?? [];
    existing.push(row.tags);
    tagsByTaskId.set(row.taggable_id, existing);
  }

  let rows = tasks ?? [];
  if (typeof tagFilter === "string") {
    const taskIdsWithTag = new Set(
      (taggables ?? []).filter((r) => r.tag_id === tagFilter).map((r) => r.taggable_id)
    );
    rows = rows.filter((t) => taskIdsWithTag.has(t.id));
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const active = rows.filter((t) => t.completed_at === null);
  const completed = rows.filter((t) => t.completed_at !== null);

  const overdue = active.filter((t) => t.due_at && new Date(t.due_at) < todayStart);
  const today = active.filter(
    (t) => t.due_at && new Date(t.due_at) >= todayStart && new Date(t.due_at) <= todayEnd
  );
  const upcoming = active.filter((t) => t.due_at && new Date(t.due_at) > todayEnd);
  const noDueDate = active.filter((t) => !t.due_at);

  const sections = [
    { title: "Overdue", tasks: overdue },
    { title: "Today", tasks: today },
    { title: "Upcoming", tasks: upcoming },
    { title: "No due date", tasks: noDueDate },
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Tasks</h1>
      <QuickAddBar />

      <TagFilterRow allTags={allTags} activeTagId={typeof tagFilter === "string" ? tagFilter : undefined} />

      {sections.map(
        (section) =>
          section.tasks.length > 0 && (
            <section key={section.title} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{section.title}</h2>
              <ul className="flex flex-col gap-2">
                {section.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    allTags={allTags}
                    assignedTags={tagsByTaskId.get(task.id) ?? []}
                  />
                ))}
              </ul>
            </section>
          )
      )}

      {active.length === 0 && (
        <p className="text-sm text-muted-foreground">No tasks yet -- add one above.</p>
      )}

      {completed.length > 0 && (
        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Completed ({completed.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {completed.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                allTags={allTags}
                assignedTags={tagsByTaskId.get(task.id) ?? []}
              />
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
