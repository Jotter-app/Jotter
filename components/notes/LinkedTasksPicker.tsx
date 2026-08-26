"use client";

import { useState, useTransition } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { linkTaskNote, unlinkTaskNote } from "@/lib/actions/taskNoteLinks";
import { toggleTaskComplete } from "@/lib/actions/tasks";

type TaskOption = { id: string; title: string; completed_at: string | null; due_at: string | null };

// Mirrors LinkedNotesPicker's search-and-link UX (same table, other
// direction). The complete-checkbox reuses toggleTaskComplete verbatim --
// same code path as /tasks, not a reimplementation, same pattern already
// used for a linked task's checkbox on EventChip.
export function LinkedTasksPicker({
  noteId,
  allTasks,
  linkedTasks,
}: {
  noteId: string;
  allTasks: TaskOption[];
  linkedTasks: TaskOption[];
}) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const linkedIds = new Set(linkedTasks.map((t) => t.id));
  const availableTasks = allTasks.filter(
    (t) => !linkedIds.has(t.id) && t.title.toLowerCase().includes(search.trim().toLowerCase())
  );

  function handleLink(taskId: string) {
    startTransition(() => linkTaskNote(taskId, noteId));
    setSearch("");
  }

  function handleUnlink(taskId: string) {
    startTransition(() => unlinkTaskNote(taskId, noteId));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {linkedTasks.length > 0 && (
        <ul className="flex flex-col gap-1">
          {linkedTasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={task.completed_at !== null}
                onCheckedChange={(checked) =>
                  startTransition(() => toggleTaskComplete(task.id, checked === true, task.due_at))
                }
              />
              <span className={task.completed_at ? "flex-1 truncate text-muted-foreground line-through" : "flex-1 truncate"}>
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => handleUnlink(task.id)}
                aria-label={`Unlink ${task.title}`}
                className="text-xs leading-none text-muted-foreground hover:text-foreground"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-6 w-fit px-2 text-xs" />}>
          + link task
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2">
          <Input
            autoFocus
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {availableTasks.length > 0 ? (
            <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
              {availableTasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-accent"
                    onClick={() => handleLink(task.id)}
                  >
                    {task.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 px-2 text-xs text-muted-foreground">
              {search.trim() ? "No matching tasks." : "No tasks to link yet."}
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
