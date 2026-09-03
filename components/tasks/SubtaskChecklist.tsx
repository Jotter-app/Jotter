"use client";

import { useRef, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { deleteTask, insertSubtask, toggleTaskComplete } from "@/lib/actions/tasks";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

export function SubtaskChecklist({ parentTaskId, subtasks }: { parentTaskId: string; subtasks: Task[] }) {
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleToggle(subtask: Task) {
    // Subtasks never have a due date, so there's never a reminder to
    // restore on un-complete -- dueAt is always null here.
    startTransition(() => toggleTaskComplete(subtask.id, subtask.completed_at === null, null));
  }

  function handleRemove(subtaskId: string) {
    startTransition(() => deleteTask(subtaskId));
  }

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      const result = await insertSubtask(parentTaskId, formData);
      if (result.ok) formRef.current?.reset();
    });
  }

  return (
    <div className="flex flex-col gap-1 pl-8">
      {subtasks.map((subtask) => {
        const completed = subtask.completed_at !== null;
        return (
          <div key={subtask.id} className="group/subtask flex items-center gap-2">
            <Checkbox checked={completed} onCheckedChange={() => handleToggle(subtask)} className="size-3.5" />
            <span className={`flex-1 text-xs ${completed ? "text-muted-foreground line-through" : ""}`}>
              {subtask.title}
            </span>
            <button
              type="button"
              onClick={() => handleRemove(subtask.id)}
              aria-label={`Remove ${subtask.title}`}
              className="text-xs leading-none text-muted-foreground opacity-0 hover:text-foreground group-hover/subtask:opacity-100"
            >
              &times;
            </button>
          </div>
        );
      })}
      <form ref={formRef} action={handleAdd}>
        <Input
          name="title"
          placeholder="Add a subtask..."
          autoComplete="off"
          className="h-6 border-none px-0 text-xs shadow-none focus-visible:ring-0"
        />
      </form>
    </div>
  );
}
