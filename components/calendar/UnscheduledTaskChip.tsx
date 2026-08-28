"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

// Same useDraggable usage EventChip already has, just carrying { task }
// instead of { event } in its drag data -- useEventDragAndDrop's
// handleDragEnd branches on which one it finds. The id is prefixed since
// dnd-kit requires unique ids across every draggable in one DndContext, and
// events/tasks are independent UUID spaces with no guaranteed non-collision
// otherwise.
export function UnscheduledTaskChip({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { task },
  });

  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className={`truncate rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground ${isDragging ? "opacity-50" : ""}`}
      {...listeners}
      {...attributes}
    >
      {task.title}
    </button>
  );
}
