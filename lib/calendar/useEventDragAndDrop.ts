import { useTransition } from "react";
import { PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { differenceInCalendarDays } from "date-fns";
import { dayKey, shiftByDays } from "@/lib/calendar/grid";
import { rescheduleEvent } from "@/lib/actions/events";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];

/** Shared by MonthView and WeekView: dragging an EventChip onto a DayCell
 * shifts both start_at and end_at by the day delta, preserving time-of-day
 * and duration. */
export function useEventDragAndDrop() {
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(dragEvent: DragEndEvent) {
    const overId = dragEvent.over?.id;
    const dragged = dragEvent.active.data.current?.event as Event | undefined;
    if (!overId || !dragged) return;

    const originalKey = dayKey(new Date(dragged.start_at));
    if (overId === originalKey) return;

    const delta = differenceInCalendarDays(new Date(String(overId)), new Date(originalKey));
    startTransition(() =>
      rescheduleEvent(dragged.id, shiftByDays(dragged.start_at, delta), shiftByDays(dragged.end_at, delta))
    );
  }

  return { sensors, handleDragEnd };
}
