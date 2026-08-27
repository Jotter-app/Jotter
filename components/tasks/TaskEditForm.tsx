"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRIORITY_LEVELS, priorityLabel } from "@/lib/tasks/priority";
import { updateTask } from "@/lib/actions/tasks";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

// Shared by TaskRow (Tasks page) and TaskChip (Calendar) -- same fields,
// same updateTask action, same optimistic-concurrency handling, so a task
// edited from either surface behaves identically and a fix only ever has
// to happen once. Container-agnostic: renders just the form content, no
// wrapping <li>/card, so each caller can place it in its own layout
// (TaskRow's list item vs. TaskChip's popover).
export function TaskEditForm({
  task,
  onSaved,
  onCancel,
}: {
  task: Task;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState(task.priority);
  const [dueAt, setDueAt] = useState(
    task.due_at ? format(new Date(task.due_at), DATETIME_LOCAL_FORMAT) : ""
  );
  const [conflict, setConflict] = useState(false);

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
      onSaved();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
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
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
