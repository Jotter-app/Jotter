"use client";

import { useState } from "react";
import { DndContext } from "@dnd-kit/core";
import { isSameMonth } from "date-fns";
import { DayCell } from "@/components/calendar/DayCell";
import { AddEventDialog } from "@/components/calendar/AddEventDialog";
import type { LinkedTask } from "@/components/calendar/EventChip";
import { buildMonthGrid, dayKey } from "@/lib/calendar/grid";
import { groupEventsByDay, groupTasksByDay } from "@/lib/calendar/group";
import { useEventDragAndDrop } from "@/lib/calendar/useEventDragAndDrop";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];
type TaskSummary = { id: string; title: string; due_at: string };

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView({
  monthDate,
  events,
  tasksWithDueDate,
  linkedTasksById,
  defaultEventCreatesTask,
}: {
  monthDate: Date;
  events: Event[];
  tasksWithDueDate: TaskSummary[];
  linkedTasksById?: Map<string, LinkedTask>;
  defaultEventCreatesTask?: boolean;
}) {
  const [addEventDate, setAddEventDate] = useState<Date | null>(null);
  const { sensors, handleDragEnd } = useEventDragAndDrop();

  const weeks = buildMonthGrid(monthDate);
  const eventsByDay = groupEventsByDay(events);
  const tasksByDay = groupTasksByDay(tasksWithDueDate);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-7 gap-px bg-border text-sm">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="bg-muted/50 p-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
        {weeks.flat().map((date) => (
          <div key={dayKey(date)} className="bg-background">
            <DayCell
              date={date}
              events={eventsByDay.get(dayKey(date)) ?? []}
              tasksDue={tasksByDay.get(dayKey(date)) ?? []}
              dimmed={!isSameMonth(date, monthDate)}
              onAddEvent={setAddEventDate}
              linkedTasksById={linkedTasksById}
            />
          </div>
        ))}
      </div>
      {addEventDate && (
        <AddEventDialog
          open={addEventDate !== null}
          onOpenChange={(open) => !open && setAddEventDate(null)}
          defaultDate={addEventDate}
          defaultEventCreatesTask={defaultEventCreatesTask}
        />
      )}
    </DndContext>
  );
}
