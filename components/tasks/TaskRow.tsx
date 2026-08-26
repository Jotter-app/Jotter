"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRIORITY_LEVELS, priorityColor, priorityLabel } from "@/lib/tasks/priority";
import { formatRelativeDays } from "@/lib/dates/relativeDays";
import { deleteTask, toggleTaskComplete, updateTask } from "@/lib/actions/tasks";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { TagPicker } from "@/components/tags/TagPicker";
import { LinkedNotesPicker } from "@/components/tasks/LinkedNotesPicker";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];
type NoteOption = { id: string; title: string };

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState(task.priority);
  const [dueAt, setDueAt] = useState(
    task.due_at ? format(new Date(task.due_at), DATETIME_LOCAL_FORMAT) : ""
  );
  const [conflict, setConflict] = useState(false);

  const completed = task.completed_at !== null;

  function handleToggle() {
    startTransition(() => toggleTaskComplete(task.id, !completed, task.due_at));
  }

  function handleDelete() {
    startTransition(() => deleteTask(task.id));
  }

  function handleSave(force = false) {
    const formData = new FormData();
    formData.set("id", task.id);
    formData.set("title", title);
    formData.set("priority", String(priority));
    formData.set("expectedUpdatedAt", task.updated_at);
    if (dueAt) formData.set("dueAt", dueAt);
    if (force) formData.set("force", "true");
    startTransition(async () => {
      const result = await updateTask(formData);
      if (result.conflict) {
        setConflict(true);
        return;
      }
      setConflict(false);
      setEditing(false);
      router.refresh();
    });
  }

  function handleCancel() {
    setTitle(task.title);
    setPriority(task.priority);
    setDueAt(task.due_at ? format(new Date(task.due_at), DATETIME_LOCAL_FORMAT) : "");
    setConflict(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-sm">
        {conflict && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs sm:flex-row sm:items-center sm:justify-between">
            <span>This task was edited elsewhere since you opened it.</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => router.refresh()}>
                Reload latest
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleSave(true)}>
                Overwrite anyway
              </Button>
            </div>
          </div>
        )}
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <div className="flex flex-wrap gap-2">
          <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v))}>
            <SelectTrigger className="w-32">
              {/* Base UI's SelectValue shows the raw value unless given a
                  render function -- unlike Radix, it doesn't auto-derive
                  the label from the matched SelectItem's children. */}
              <SelectValue>{(value: string) => priorityLabel(Number(value))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_LEVELS.map((p) => (
                <SelectItem key={p.value} value={String(p.value)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-56"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => handleSave()} disabled={isPending || title.trim().length === 0}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isPending}>
            Cancel
          </Button>
        </div>
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
