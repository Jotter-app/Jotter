"use client";

import { useState, useTransition } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Checkbox } from "@/components/ui/checkbox";
import { priorityColor, priorityLabel } from "@/lib/tasks/priority";
import { dueDateStatus } from "@/lib/tasks/dueDateStatus";
import { formatRelativeDays } from "@/lib/dates/relativeDays";
import { useTimeZone } from "@/components/shared/TimeZoneProvider";
import { toggleTaskComplete } from "@/lib/actions/tasks";
import { TaskDetailDialog } from "@/components/tasks/TaskDetailDialog";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];
type Section = Database["public"]["Tables"]["sections"]["Row"];
type NoteOption = { id: string; title: string };
type LinkedNoteOption = NoteOption & { body_markdown: string; updated_at: string };

// Modeled on EventChip: a small draggable summary (this component) with the
// rich, always-visible content TaskRow shows inline living in a separate
// overlay instead -- a Kanban column is too narrow to hold TagPicker,
// LinkedNotesPicker, SubtaskChecklist, etc. all at once the way a full-width
// list row can.
export function TaskCard({
  task,
  allTags,
  assignedTags,
  allNotes,
  linkedNotes,
  subtasks = [],
  allSections,
  section = null,
  projectId,
}: {
  task: Task;
  allTags: Tag[];
  assignedTags: Tag[];
  allNotes: NoteOption[];
  linkedNotes: LinkedNoteOption[];
  subtasks?: Task[];
  allSections: Section[];
  section?: Section | null;
  projectId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [detailOpen, setDetailOpen] = useState(false);
  const timeZone = useTimeZone();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const completed = task.completed_at !== null;
  const dueDate = task.due_at ? new Date(task.due_at) : null;
  const { isOverdue, isDueToday } = dueDateStatus(dueDate, completed, timeZone);
  const completedSubtaskCount = subtasks.filter((s) => s.completed_at !== null).length;

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  function handleToggle() {
    startTransition(() => toggleTaskComplete(task.id, !completed, task.due_at));
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        data-testid="task-card"
        className={`flex flex-col gap-1.5 rounded-xl border bg-background p-2.5 shadow-sm ${isDragging ? "opacity-50" : ""}`}
      >
        <div className="flex items-start gap-2" {...listeners} {...attributes}>
          <Checkbox
            checked={completed}
            onCheckedChange={handleToggle}
            disabled={isPending}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className={`flex-1 text-left text-sm ${completed ? "text-muted-foreground line-through" : ""}`}
            onClick={() => setDetailOpen(true)}
          >
            {task.title}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-6 text-xs">
          {task.priority > 0 && (
            <span
              title={priorityLabel(task.priority)}
              className={`h-2 w-2 shrink-0 rounded-full ${priorityColor(task.priority)}`}
            />
          )}
          {dueDate && (
            <span
              className={`whitespace-nowrap ${
                isOverdue
                  ? "rounded-full bg-accent-700 px-2 py-0.5 font-medium text-accent-100"
                  : isDueToday
                    ? "rounded-full bg-accent-100 px-2 py-0.5 font-medium text-accent-800"
                    : "text-muted-foreground"
              }`}
            >
              {formatRelativeDays(dueDate, timeZone)}
            </span>
          )}
          {subtasks.length > 0 && (
            <span className="whitespace-nowrap text-muted-foreground">
              {completedSubtaskCount}/{subtasks.length}
            </span>
          )}
        </div>
      </div>
      <TaskDetailDialog
        task={task}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        allTags={allTags}
        assignedTags={assignedTags}
        allNotes={allNotes}
        linkedNotes={linkedNotes}
        subtasks={subtasks}
        allSections={allSections}
        currentSection={section}
        projectId={projectId}
      />
    </>
  );
}
