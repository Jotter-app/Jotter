"use client";

import { useState, useTransition } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Input } from "@/components/ui/input";
import { TaskCard } from "@/components/tasks/TaskCard";
import { QuickAddBar } from "@/components/tasks/QuickAddBar";
import { SectionDeleteDialog } from "@/components/projects/SectionDeleteDialog";
import { renameSection } from "@/lib/actions/sections";
import { UNSECTIONED_DROPPABLE_ID } from "@/lib/sections/useSectionDragAndDrop";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];
type Section = Database["public"]["Tables"]["sections"]["Row"];
type NoteOption = { id: string; title: string };
type LinkedNoteOption = NoteOption & { body_markdown: string; updated_at: string };

// One board column. Mirrors DayCell's useDroppable pattern -- the "No
// Section" column (section: null) uses a fixed sentinel id since it isn't a
// real row, and has no rename/delete affordances since there's nothing to
// rename or delete.
export function SectionColumn({
  projectId,
  section,
  tasks,
  allTags,
  tagsByTaskId,
  allNotes,
  linkedNotesByTaskId,
  subtasksByTaskId,
  allSections,
}: {
  projectId: string;
  section: Section | null;
  tasks: Task[];
  allTags: Tag[];
  tagsByTaskId: Map<string, Tag[]>;
  allNotes: NoteOption[];
  linkedNotesByTaskId: Map<string, LinkedNoteOption[]>;
  subtasksByTaskId: Map<string, Task[]>;
  allSections: Section[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: section?.id ?? UNSECTIONED_DROPPABLE_ID });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(section?.name ?? "");
  const [, startTransition] = useTransition();

  function handleRenameSave() {
    const trimmed = name.trim();
    setRenaming(false);
    if (!section || !trimmed || trimmed === section.name) {
      setName(section?.name ?? "");
      return;
    }
    startTransition(() => renameSection(section.id, projectId, trimmed));
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 snap-start flex-col gap-2 rounded-2xl border bg-card p-3 shadow-sm transition-colors ${isOver ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRenameSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleRenameSave();
              }
              if (e.key === "Escape") {
                setName(section?.name ?? "");
                setRenaming(false);
              }
            }}
            className="h-7 text-sm font-semibold"
          />
        ) : (
          <button
            type="button"
            onClick={() => section && setRenaming(true)}
            className="text-left text-sm font-semibold hover:opacity-80"
          >
            {section?.name ?? "No Section"}
          </button>
        )}
        <div className="flex items-center gap-1">
          <span className="whitespace-nowrap text-xs text-muted-foreground">{tasks.length}</span>
          {section && (
            <SectionDeleteDialog
              sectionId={section.id}
              projectId={projectId}
              sectionName={section.name}
              hasTasks={tasks.length > 0}
            />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskCard
            key={`${task.id}-${task.updated_at}`}
            task={task}
            allTags={allTags}
            assignedTags={tagsByTaskId.get(task.id) ?? []}
            allNotes={allNotes}
            linkedNotes={linkedNotesByTaskId.get(task.id) ?? []}
            subtasks={subtasksByTaskId.get(task.id) ?? []}
            allSections={allSections}
            section={section}
            projectId={projectId}
          />
        ))}
      </div>
      <QuickAddBar projectId={projectId} sectionId={section?.id} />
    </div>
  );
}
