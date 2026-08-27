"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { priorityColor, priorityLabel } from "@/lib/tasks/priority";
import { formatRelativeDays } from "@/lib/dates/relativeDays";
import { archiveTask, deleteTask, toggleTaskComplete } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { TagPicker } from "@/components/tags/TagPicker";
import { LinkedNotesPicker } from "@/components/tasks/LinkedNotesPicker";
import { TaskEditForm } from "@/components/tasks/TaskEditForm";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];
type NoteOption = { id: string; title: string };

export function TaskRow({
  task,
  allTags,
  assignedTags,
  allNotes,
  linkedNotes,
}: {
  task: Task;
  allTags: Tag[];
  assignedTags: Tag[];
  allNotes: NoteOption[];
  linkedNotes: NoteOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const completed = task.completed_at !== null;

  function handleToggle() {
    startTransition(() => toggleTaskComplete(task.id, !completed, task.due_at));
  }

  function handleDelete() {
    startTransition(() => deleteTask(task.id));
  }

  function handleArchive() {
    startTransition(() => archiveTask(task.id));
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-sm">
        <TaskEditForm task={task} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="group flex flex-col gap-2 rounded-lg border bg-background p-3 transition-colors hover:border-border hover:bg-accent/30">
      <div className="flex items-center gap-3">
        <Checkbox checked={completed} onCheckedChange={handleToggle} disabled={isPending} />
        <button
          type="button"
          className={`flex-1 text-left text-sm ${completed ? "text-muted-foreground line-through" : ""}`}
          onClick={() => setEditing(true)}
        >
          {task.title}
        </button>
        {task.priority > 0 && (
          <span
            title={priorityLabel(task.priority)}
            className={`h-2 w-2 shrink-0 rounded-full ${priorityColor(task.priority)}`}
          />
        )}
        {task.due_at && (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatRelativeDays(new Date(task.due_at))} &middot; {format(new Date(task.due_at), "MMM d, h:mm a")}
          </span>
        )}
        {completed && (
          <Button size="sm" variant="ghost" onClick={handleArchive} disabled={isPending}>
            Archive
          </Button>
        )}
        <ConfirmDeleteButton
          title={`Delete "${task.title}"?`}
          onConfirm={handleDelete}
          disabled={isPending}
        />
      </div>
      <TagPicker taggableId={task.id} taggableType="task" allTags={allTags} assignedTags={assignedTags} />
      <LinkedNotesPicker taskId={task.id} allNotes={allNotes} linkedNotes={linkedNotes} />
    </li>
  );
}
