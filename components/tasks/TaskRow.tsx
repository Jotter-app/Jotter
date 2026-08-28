"use client";

import { useState, useTransition } from "react";
import { isPast } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { priorityColor, priorityLabel } from "@/lib/tasks/priority";
import { formatRelativeDays, isTodayInTimeZone } from "@/lib/dates/relativeDays";
import { formatInTimeZone } from "@/lib/dates/formatInTimeZone";
import { useTimeZone } from "@/components/shared/TimeZoneProvider";
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
type LinkedNoteOption = NoteOption & { body_markdown: string; updated_at: string };

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
  linkedNotes: LinkedNoteOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const timeZone = useTimeZone();

  const completed = task.completed_at !== null;
  const dueDate = task.due_at ? new Date(task.due_at) : null;
  // isPast compares raw instants (`date.getTime() < Date.now()`), which is
  // timezone-invariant, so it's left as-is -- only the calendar-day check
  // needs the viewer's timezone, since "is this still today" depends on
  // where the viewer's midnight falls.
  const isOverdue = !completed && dueDate !== null && isPast(dueDate) && !isTodayInTimeZone(dueDate, timeZone);
  const isDueToday = dueDate !== null && isTodayInTimeZone(dueDate, timeZone);

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
      <li className="flex flex-col gap-2 rounded-2xl border bg-background p-3 shadow-sm">
        <TaskEditForm task={task} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="group flex flex-col gap-2 rounded-2xl border bg-background p-3 transition-colors hover:border-border hover:bg-accent/30">
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
        {dueDate && (
          <span
            className={`whitespace-nowrap text-xs ${
              isOverdue
                ? "rounded-full bg-accent-700 px-2 py-0.5 font-medium text-accent-100"
                : isDueToday
                  ? "rounded-full bg-accent-100 px-2 py-0.5 font-medium text-accent-800"
                  : "text-muted-foreground"
            }`}
          >
            {formatRelativeDays(dueDate, timeZone)} &middot; {formatInTimeZone(dueDate, timeZone, "MMM d, h:mm a")}
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
