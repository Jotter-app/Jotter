"use client";

import { useState } from "react";
import { DndContext } from "@dnd-kit/core";
import { format } from "date-fns";
import { DayCell } from "@/components/calendar/DayCell";
import { AddEventDialog } from "@/components/calendar/AddEventDialog";
import { UnscheduledTasksPanel } from "@/components/calendar/UnscheduledTasksPanel";
import type { LinkedTask } from "@/components/calendar/EventChip";
import { buildWeek, dayKey } from "@/lib/calendar/grid";
import { groupEventsByDay, groupTasksByDay, groupVirtualOccurrencesByDay } from "@/lib/calendar/group";
import { useEventDragAndDrop } from "@/lib/calendar/useEventDragAndDrop";
import { useTimeZone } from "@/components/shared/TimeZoneProvider";
import type { Database } from "@/lib/supabase/database.types";
import type { VirtualOccurrence } from "@/lib/calendar/expandRecurrence";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"] & { due_at: string };
type UnscheduledTask = Database["public"]["Tables"]["tasks"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];

export function WeekView({
  weekDate,
  events,
  tasksWithDueDate,
  linkedTasksById,
  defaultEventCreatesTask,
  googleCalendarConnected,
  allTags,
  tagsByEventId,
  unscheduledTasks,
  virtualOccurrences,
}: {
  weekDate: Date;
  events: Event[];
  tasksWithDueDate: Task[];
  linkedTasksById?: Map<string, LinkedTask>;
  defaultEventCreatesTask?: boolean;
  googleCalendarConnected?: boolean;
  allTags?: Tag[];
  tagsByEventId?: Map<string, Tag[]>;
  unscheduledTasks?: UnscheduledTask[];
  virtualOccurrences?: VirtualOccurrence[];
}) {
  const [addEventDate, setAddEventDate] = useState<Date | null>(null);
  const { sensors, handleDragEnd } = useEventDragAndDrop();
  const timeZone = useTimeZone();

  const days = buildWeek(weekDate, timeZone);
  const eventsByDay = groupEventsByDay(events, timeZone);
  const tasksByDay = groupTasksByDay(tasksWithDueDate, timeZone);
  const virtualOccurrencesByDay = groupVirtualOccurrencesByDay(virtualOccurrences ?? [], timeZone);

  return (
    <DndContext id="calendar-week-grid" sensors={sensors} onDragEnd={handleDragEnd}>
      <UnscheduledTasksPanel tasks={unscheduledTasks ?? []} />
      <div className="grid grid-cols-7 gap-2 text-sm">
        {days.map((date) => (
          <div key={dayKey(date, timeZone)} className="p-1.5 text-center text-xs font-medium text-muted-foreground">
            {format(date, "EEE d")}
          </div>
        ))}
        {days.map((date) => (
          <DayCell
            key={dayKey(date, timeZone)}
            date={date}
            events={eventsByDay.get(dayKey(date, timeZone)) ?? []}
            tasksDue={tasksByDay.get(dayKey(date, timeZone)) ?? []}
            virtualOccurrences={virtualOccurrencesByDay.get(dayKey(date, timeZone)) ?? []}
            onAddEvent={setAddEventDate}
            linkedTasksById={linkedTasksById}
            allTags={allTags}
            tagsByEventId={tagsByEventId}
            className="min-h-64"
          />
        ))}
      </div>
      {addEventDate && (
        <AddEventDialog
          open={addEventDate !== null}
          onOpenChange={(open) => !open && setAddEventDate(null)}
          defaultDate={addEventDate}
          defaultEventCreatesTask={defaultEventCreatesTask}
          googleCalendarConnected={googleCalendarConnected}
        />
      )}
    </DndContext>
  );
}
