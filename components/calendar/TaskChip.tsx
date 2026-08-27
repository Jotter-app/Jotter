"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { TaskEditForm } from "@/components/tasks/TaskEditForm";
import { deleteTask, toggleTaskComplete } from "@/lib/actions/tasks";
import { priorityColor, priorityLabel } from "@/lib/tasks/priority";
import { formatRelativeDays } from "@/lib/dates/relativeDays";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

// Same complete/edit/delete affordances TaskRow gives a task on the Tasks
// page, reached from the calendar instead -- a task due beyond "This
// Month" (see the tasks-page due-date-grouping change) only ever shows up
// here, so it needs a real management path of its own rather than the bare
// "click through to a page that won't show it" link this replaces.
export function TaskChip({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);

  const completed = task.completed_at !== null;

  function handleDelete() {
    startTransition(() => deleteTask(task.id));
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setEditing(false);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-xs hover:bg-accent ${completed ? "text-muted-foreground line-through" : ""}`}
          />
        }
      >
        {task.title}
      </PopoverTrigger>
      <PopoverContent className="w-72">
        {editing ? (
          <TaskEditForm task={task} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex items-start gap-2">
              <p className={`flex-1 text-sm font-medium ${completed ? "text-muted-foreground line-through" : ""}`}>
                {task.title}
              </p>
              {task.priority > 0 && (
                <span
                  title={priorityLabel(task.priority)}
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${priorityColor(task.priority)}`}
                />
              )}
            </div>
            {task.due_at && (
              <p className="text-xs text-muted-foreground">
                {formatRelativeDays(new Date(task.due_at))} &middot; {format(new Date(task.due_at), "MMM d, h:mm a")}
              </p>
            )}
            <label className="mt-2 flex items-center gap-2 text-sm">
              <Checkbox
                checked={completed}
                onCheckedChange={(checked) =>
                  startTransition(() => toggleTaskComplete(task.id, checked === true, task.due_at))
                }
              />
              Mark complete
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Edit
              </button>
              <ConfirmDeleteButton
                title={`Delete "${task.title}"?`}
                onConfirm={handleDelete}
                disabled={isPending}
                trigger={
                  <button type="button" className="text-sm text-muted-foreground hover:text-destructive">
                    Delete
                  </button>
                }
              />
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
