"use client";

import { useTransition } from "react";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { deleteTask, toggleTaskComplete, unarchiveTask } from "@/lib/actions/tasks";
import { formatRelativeDays } from "@/lib/dates/relativeDays";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

// Deliberately lighter than TaskRow -- an archived task is meant to be out
// of the way, not actively managed, so there's no tag picker, linked-notes
// picker, or click-to-edit here. Just enough to glance back, restore, or
// permanently remove.
export function ArchivedTaskRow({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition();

  function handleToggle(checked: boolean) {
    // Un-completing also un-archives (toggleTaskComplete clears
    // archived_at when uncompleted) -- unchecking here is what moves a
    // task back to the normal active list, not a separate step.
    startTransition(() => toggleTaskComplete(task.id, checked, task.due_at));
  }

  function handleUnarchive() {
    startTransition(() => unarchiveTask(task.id));
  }

  function handleDelete() {
    startTransition(() => deleteTask(task.id));
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <Checkbox checked={task.completed_at !== null} onCheckedChange={handleToggle} disabled={isPending} />
      <span className="flex-1 truncate text-sm text-muted-foreground line-through">{task.title}</span>
      {task.due_at && (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatRelativeDays(new Date(task.due_at))} &middot; {format(new Date(task.due_at), "MMM d, h:mm a")}
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={handleUnarchive} disabled={isPending}>
        Unarchive
      </Button>
      <ConfirmDeleteButton title={`Delete "${task.title}"?`} onConfirm={handleDelete} disabled={isPending} />
    </li>
  );
}
