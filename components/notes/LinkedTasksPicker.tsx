"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PreviewCard, PreviewCardContent, PreviewCardTrigger } from "@/components/ui/preview-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { linkTaskNote, unlinkTaskNote } from "@/lib/actions/taskNoteLinks";
import { toggleTaskComplete } from "@/lib/actions/tasks";
import { formatRelativeDays } from "@/lib/dates/relativeDays";
import { priorityColor, priorityLabel } from "@/lib/tasks/priority";

type TaskOption = {
  id: string;
  title: string;
  completed_at: string | null;
  due_at: string | null;
  priority: number;
};

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
              <PreviewCard>
                <PreviewCardTrigger
                  render={
                    <span
                      className={
                        task.completed_at ? "flex-1 truncate text-muted-foreground line-through" : "flex-1 truncate"
                      }
                    />
                  }
                >
                  {task.title}
                </PreviewCardTrigger>
                <PreviewCardContent>
                  <p className="font-medium">{task.title}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span title={priorityLabel(task.priority)} className={`h-2 w-2 shrink-0 rounded-full ${priorityColor(task.priority)}`} />
                    {priorityLabel(task.priority)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {task.due_at
                      ? `${formatRelativeDays(new Date(task.due_at))} · ${format(new Date(task.due_at), "MMM d, h:mm a")}`
                      : "No due date"}
                  </p>
                  <p className="text-xs text-muted-foreground">{task.completed_at ? "Completed" : "Not completed"}</p>
                </PreviewCardContent>
              </PreviewCard>
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
