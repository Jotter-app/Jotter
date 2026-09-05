import { useTransition } from "react";
import { PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { assignTaskSection } from "@/lib/actions/sections";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

// Droppable id for the "No Section" column -- not a real row, so it can't
// use a section's own uuid the way every other column does.
export const UNSECTIONED_DROPPABLE_ID = "unsectioned";

// Modeled directly on useEventDragAndDrop: same PointerSensor activation
// distance (already what lets a TaskCard hold a checkbox without every
// click being mistaken for a drag), same shape of reading the dragged
// payload off `active.data.current`.
export function useSectionDragAndDrop(projectId: string) {
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(dragEvent: DragEndEvent) {
    const overId = dragEvent.over?.id;
    if (!overId) return;

    const task = dragEvent.active.data.current?.task as Task | undefined;
    if (!task) return;

    const sectionId = overId === UNSECTIONED_DROPPABLE_ID ? null : String(overId);
    if (sectionId === task.section_id) return;

    startTransition(() => {
      assignTaskSection(task.id, sectionId, projectId);
    });
  }

  return { sensors, handleDragEnd };
}
