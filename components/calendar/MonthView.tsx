"use client";

import { useState } from "react";
import { DndContext } from "@dnd-kit/core";
import { isSameMonth } from "date-fns";
import { DayCell } from "@/components/calendar/DayCell";
import { AddEventDialog } from "@/components/calendar/AddEventDialog";
import { UnscheduledTasksPanel } from "@/components/calendar/UnscheduledTasksPanel";
import type { LinkedTask } from "@/components/calendar/EventChip";
import { buildMonthGrid, dayKey } from "@/lib/calendar/grid";
import { groupEventsByDay, groupTasksByDay } from "@/lib/calendar/group";
import { useEventDragAndDrop } from "@/lib/calendar/useEventDragAndDrop";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"] & { due_at: string };
type UnscheduledTask = Database["public"]["Tables"]["tasks"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView({
  monthDate,
  events,
  tasksWithDueDate,
  linkedTasksById,
  defaultEventCreatesTask,
  allTags,
  tagsByEventId,
  unscheduledTasks,
}: {
  monthDate: Date;
  events: Event[];
  tasksWithDueDate: Task[];
  linkedTasksById?: Map<string, LinkedTask>;
  defaultEventCreatesTask?: boolean;
  allTags?: Tag[];
  tagsByEventId?: Map<string, Tag[]>;
  unscheduledTasks?: UnscheduledTask[];
}) {
  const [addEventDate, setAddEventDate] = useState<Date | null>(null);
  const { sensors, handleDragEnd } = useEventDragAndDrop();

  const weeks = buildMonthGrid(monthDate);
  const eventsByDay = groupEventsByDay(events);
  const tasksByDay = groupTasksByDay(tasksWithDueDate);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <UnscheduledTasksPanel tasks={unscheduledTasks ?? []} />
      <div className="grid grid-cols-7 gap-2 text-sm">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="p-1.5 text-center text-xs font-medium text-muted-foreground">
            {label}
          </div>
        ))}
        {weeks.flat().map((date) => (
          <DayCell
            key={dayKey(date)}
            date={date}
            events={eventsByDay.get(dayKey(date)) ?? []}
            tasksDue={tasksByDay.get(dayKey(date)) ?? []}
            dimmed={!isSameMonth(date, monthDate)}
            onAddEvent={setAddEventDate}
            linkedTasksById={linkedTasksById}
            allTags={allTags}
            tagsByEventId={tagsByEventId}
          />
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
