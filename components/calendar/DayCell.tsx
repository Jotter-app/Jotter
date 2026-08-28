"use client";

import { useDroppable } from "@dnd-kit/core";
import { isToday } from "date-fns";
import { Plus } from "lucide-react";
import { EventChip, type LinkedTask } from "@/components/calendar/EventChip";
import { TaskChip } from "@/components/calendar/TaskChip";
import { dayKey } from "@/lib/calendar/grid";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];

export function DayCell({
  date,
  events,
  tasksDue,
  dimmed,
  onAddEvent,
  linkedTasksById,
  allTags,
  tagsByEventId,
  className,
}: {
  date: Date;
  events: Event[];
  tasksDue: Task[];
  dimmed?: boolean;
  onAddEvent: (date: Date) => void;
  linkedTasksById?: Map<string, LinkedTask>;
  allTags?: Tag[];
  tagsByEventId?: Map<string, Tag[]>;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(date) });

  const bg = isOver ? "bg-primary/10" : dimmed ? "bg-muted/30" : isToday(date) ? "bg-accent-100" : "bg-card";

  return (
    <div
      ref={setNodeRef}
      data-testid="day-cell"
      data-date={dayKey(date)}
      className={cn(
        "group/cell flex min-h-24 flex-col gap-1 rounded-2xl p-1.5 shadow-sm transition-colors",
        bg,
        dimmed ? "text-muted-foreground shadow-none" : "",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex size-5 items-center justify-center rounded-full text-xs ${isToday(date) ? "bg-primary font-medium text-primary-foreground" : ""}`}
        >
          {date.getDate()}
        </span>
        <button
          type="button"
          onClick={() => onAddEvent(date)}
          className="flex size-4 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/cell:opacity-100"
          aria-label="Add event"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {events.map((event) => (
          <EventChip
            key={event.id}
            event={event}
            linkedTask={event.linked_task_id ? linkedTasksById?.get(event.linked_task_id) : undefined}
            allTags={allTags}
            assignedTags={tagsByEventId?.get(event.id)}
          />
        ))}
        {tasksDue.map((task) => (
          <TaskChip key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
