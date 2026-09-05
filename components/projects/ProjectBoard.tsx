"use client";

import { DndContext } from "@dnd-kit/core";
import { SectionColumn } from "@/components/projects/SectionColumn";
import { AddSectionButton } from "@/components/projects/AddSectionButton";
import { useSectionDragAndDrop } from "@/lib/sections/useSectionDragAndDrop";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];
type Section = Database["public"]["Tables"]["sections"]["Row"];
type NoteOption = { id: string; title: string };
type LinkedNoteOption = NoteOption & { body_markdown: string; updated_at: string };

// A project's tasks, subdivided into named columns you drag cards between.
// Owns the DndContext, mirroring MonthView's usage of useEventDragAndDrop.
export function ProjectBoard({
  projectId,
  sections,
  tasksBySectionId,
  allTags,
  tagsByTaskId,
  allNotes,
  linkedNotesByTaskId,
  subtasksByTaskId,
}: {
  projectId: string;
  sections: Section[];
  tasksBySectionId: Map<string | null, Task[]>;
  allTags: Tag[];
  tagsByTaskId: Map<string, Tag[]>;
  allNotes: NoteOption[];
  linkedNotesByTaskId: Map<string, LinkedNoteOption[]>;
  subtasksByTaskId: Map<string, Task[]>;
}) {
  const { sensors, handleDragEnd } = useSectionDragAndDrop(projectId);

  const columnProps = {
    projectId,
    allTags,
    tagsByTaskId,
    allNotes,
    linkedNotesByTaskId,
    subtasksByTaskId,
    allSections: sections,
  };

  return (
    <DndContext id="project-board" sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2 [scroll-snap-type:x_proximity]">
        <SectionColumn section={null} tasks={tasksBySectionId.get(null) ?? []} {...columnProps} />
        {sections.map((section) => (
          <SectionColumn
            key={section.id}
            section={section}
            tasks={tasksBySectionId.get(section.id) ?? []}
            {...columnProps}
          />
        ))}
        <div className="w-72 shrink-0 snap-start">
          <AddSectionButton projectId={projectId} className="w-full" />
        </div>
      </div>
    </DndContext>
  );
}
