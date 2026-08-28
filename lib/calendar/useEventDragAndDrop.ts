import { useTransition } from "react";
import { PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { differenceInCalendarDays } from "date-fns";
import { dayKey, shiftByDays } from "@/lib/calendar/grid";
import { rescheduleEvent, timeboxTask } from "@/lib/actions/events";
import { useTimeZone } from "@/components/shared/TimeZoneProvider";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];

/** Shared by MonthView and WeekView: dragging an EventChip onto a DayCell
 * shifts both start_at and end_at by the day delta, preserving time-of-day
 * and duration; dragging an UnscheduledTaskChip onto a DayCell timeboxes it
 * (drag-to-timebox) -- both land on the same droppable id (dayKey), so the
 * branch is on which kind of drag data is present, not on the drop target. */
export function useEventDragAndDrop() {
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const timeZone = useTimeZone();

  function handleDragEnd(dragEvent: DragEndEvent) {
    const overId = dragEvent.over?.id;
    if (!overId) return;

    const draggedEvent = dragEvent.active.data.current?.event as Event | undefined;
    if (draggedEvent) {
      const originalKey = dayKey(new Date(draggedEvent.start_at), timeZone);
      if (overId === originalKey) return;

      const delta = differenceInCalendarDays(new Date(String(overId)), new Date(originalKey));
      startTransition(() =>
        rescheduleEvent(draggedEvent.id, shiftByDays(draggedEvent.start_at, delta), shiftByDays(draggedEvent.end_at, delta))
      );
      return;
    }

    const draggedTask = dragEvent.active.data.current?.task as Task | undefined;
    if (draggedTask) {
      startTransition(() => {
        timeboxTask(draggedTask.id, String(overId));
      });
    }
  }

  return { sensors, handleDragEnd };
}
