"use client";

import { useState } from "react";
import { DndContext } from "@dnd-kit/core";
import { format } from "date-fns";
import { DayCell } from "@/components/calendar/DayCell";
import { AddEventDialog } from "@/components/calendar/AddEventDialog";
import { buildWeek, dayKey } from "@/lib/calendar/grid";
import { groupEventsByDay, groupTasksByDay } from "@/lib/calendar/group";
import { useEventDragAndDrop } from "@/lib/calendar/useEventDragAndDrop";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];
type TaskSummary = { id: string; title: string; due_at: string };

export function WeekView({
  weekDate,
  events,
  tasksWithDueDate,
}: {
  weekDate: Date;
  events: Event[];
  tasksWithDueDate: TaskSummary[];
}) {
  const [addEventDate, setAddEventDate] = useState<Date | null>(null);
  const { sensors, handleDragEnd } = useEventDragAndDrop();

  const days = buildWeek(weekDate);
  const eventsByDay = groupEventsByDay(events);
  const tasksByDay = groupTasksByDay(tasksWithDueDate);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-7 gap-px bg-border text-sm">
        {days.map((date) => (
          <div
            key={dayKey(date)}
            className="bg-muted/50 p-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {format(date, "EEE d")}
          </div>
        ))}
        {days.map((date) => (
          <div key={dayKey(date)} className="min-h-64 bg-background">
            <DayCell
              date={date}
              events={eventsByDay.get(dayKey(date)) ?? []}
              tasksDue={tasksByDay.get(dayKey(date)) ?? []}
              onAddEvent={setAddEventDate}
            />
          </div>
        ))}
      </div>
      {addEventDate && (
        <AddEventDialog
          open={addEventDate !== null}
          onOpenChange={(open) => !open && setAddEventDate(null)}
          defaultDate={addEventDate}
        />
      )}
    </DndContext>
  );
}
