"use client";

import { useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { archiveTask, deleteTask } from "@/lib/actions/tasks";
import { TagPicker } from "@/components/tags/TagPicker";
import { LinkedNotesPicker } from "@/components/tasks/LinkedNotesPicker";
import { SubtaskChecklist } from "@/components/tasks/SubtaskChecklist";
import { SectionPicker } from "@/components/tasks/SectionPicker";
import { TaskEditForm } from "@/components/tasks/TaskEditForm";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];
type Section = Database["public"]["Tables"]["sections"]["Row"];
type NoteOption = { id: string; title: string };
type LinkedNoteOption = NoteOption & { body_markdown: string; updated_at: string };

// The modal a TaskCard opens on click. Functionally this is TaskRow's
// existing always-visible content (tags, notes, subtasks, edit, delete/
// archive), repackaged into a dialog body instead of an always-expanded
// list row -- a board column is too narrow to show all of that inline the
// way a full-width list row can. Deliberately no ProjectPicker: a card's
// project is already fixed by which board it's on, and moving a task to a
// different project stays a global-Tasks-page action.
export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  allTags,
  assignedTags,
  allNotes,
  linkedNotes,
  subtasks = [],
  allSections,
  currentSection,
  projectId,
}: {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allTags: Tag[];
  assignedTags: Tag[];
  allNotes: NoteOption[];
  linkedNotes: LinkedNoteOption[];
  subtasks?: Task[];
  allSections: Section[];
  currentSection: Section | null;
  projectId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const completed = task.completed_at !== null;

  function handleDelete() {
    startTransition(() => deleteTask(task.id));
    onOpenChange(false);
  }

  function handleArchive() {
    startTransition(() => archiveTask(task.id));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="sr-only">Task details</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <TaskEditForm task={task} onSaved={() => {}} onCancel={() => onOpenChange(false)} />
          <SectionPicker
            taskId={task.id}
            projectId={projectId}
            allSections={allSections}
            currentSection={currentSection}
          />
          <TagPicker taggableId={task.id} taggableType="task" allTags={allTags} assignedTags={assignedTags} />
          <LinkedNotesPicker taskId={task.id} allNotes={allNotes} linkedNotes={linkedNotes} />
          <SubtaskChecklist parentTaskId={task.id} subtasks={subtasks} />
          <div className="flex justify-end gap-2 border-t pt-3">
            {completed && (
              <Button size="sm" variant="ghost" onClick={handleArchive} disabled={isPending}>
                Archive
              </Button>
            )}
            <ConfirmDeleteButton title={`Delete "${task.title}"?`} onConfirm={handleDelete} disabled={isPending} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
