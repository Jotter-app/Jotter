import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { projectAccentClass } from "@/lib/projects/projectAccent";

export default async function ProjectsPage() {
  const supabase = await createClient();

  // Fetch flat, aggregate in memory -- same convention as
  // NotebookManageList's note counts (lib/notes/tree.ts), rather than a
  // per-project count query or a SQL aggregate.
  const [{ data: projects }, { data: tasks }] = await Promise.all([
    supabase.from("projects").select().order("name"),
    supabase.from("tasks").select("id, project_id, completed_at").not("project_id", "is", null),
  ]);

  const activeCountByProjectId = new Map<string, number>();
  for (const task of tasks ?? []) {
    if (!task.project_id || task.completed_at !== null) continue;
    activeCountByProjectId.set(task.project_id, (activeCountByProjectId.get(task.project_id) ?? 0) + 1);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl tracking-tight">Projects</h1>
        <CreateProjectDialog />
      </div>

      {(projects ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">No projects yet -- create one above.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {(projects ?? []).map((project) => {
            const count = activeCountByProjectId.get(project.id) ?? 0;
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition-colors hover:border-border hover:bg-accent/30"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium ${projectAccentClass(project.id)}`}
                  >
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium">{project.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {count} active {count === 1 ? "task" : "tasks"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
