"use client";

import { useState, useTransition } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assignTaskProject } from "@/lib/actions/projects";
import { projectAccentClass } from "@/lib/projects/projectAccent";
import type { Database } from "@/lib/supabase/database.types";

type Project = Database["public"]["Tables"]["projects"]["Row"];

// TagPicker's popover-with-search shape, adapted to single-select --
// picking a project replaces the task's current one rather than adding to
// a set, since a task belongs to at most one project (exclusive, like a
// note's folder_id, not many-to-many like tags).
export function ProjectPicker({
  taskId,
  allProjects,
  currentProject,
}: {
  taskId: string;
  allProjects: Project[];
  currentProject: Project | null;
}) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const otherProjects = allProjects
    .filter((p) => p.id !== currentProject?.id)
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  function handlePick(projectId: string | null) {
    startTransition(() => assignTaskProject(taskId, projectId));
    setSearch("");
    setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {currentProject && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${projectAccentClass(currentProject.id)}`}
        >
          {currentProject.name}
          <button
            type="button"
            onClick={() => handlePick(null)}
            aria-label={`Remove from ${currentProject.name}`}
            className="leading-none"
          >
            &times;
          </button>
        </span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-6 px-2 text-xs" />}>
          {currentProject ? "change project" : "+ project"}
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2">
          <Input autoFocus placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {(currentProject || otherProjects.length > 0) && (
            <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
              {currentProject && (
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent"
                    onClick={() => handlePick(null)}
                  >
                    No project
                  </button>
                </li>
              )}
              {otherProjects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent"
                    onClick={() => handlePick(project.id)}
                  >
                    {project.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
