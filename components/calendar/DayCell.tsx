"use client";

import { useDroppable } from "@dnd-kit/core";
import Link from "next/link";
import { isToday } from "date-fns";
import { Plus } from "lucide-react";
import { EventChip } from "@/components/calendar/EventChip";
import { dayKey } from "@/lib/calendar/grid";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];
type TaskSummary = { id: string; title: string };

export function DayCell({
  date,
  events,
  tasksDue,
  dimmed,
  onAddEvent,
}: {
  date: Date;
  events: Event[];
  tasksDue: TaskSummary[];
  dimmed?: boolean;
  onAddEvent: (date: Date) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(date) });

  const bg = isOver ? "bg-primary/10" : dimmed ? "bg-muted/20" : "bg-background";

  return (
    <div
      ref={setNodeRef}
      data-testid="day-cell"
      data-date={dayKey(date)}
      className={`group/cell flex min-h-24 flex-col gap-1 p-1.5 transition-colors ${bg} ${dimmed ? "text-muted-foreground" : ""}`}
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
          <EventChip key={event.id} event={event} />
        ))}
        {tasksDue.map((task) => (
          <Link
            key={task.id}
            href="/tasks"
            className="block truncate rounded border px-1.5 py-0.5 text-xs hover:bg-accent"
          >
            {task.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
