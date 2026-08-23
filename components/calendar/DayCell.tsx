"use client";

import { useDroppable } from "@dnd-kit/core";
import Link from "next/link";
import { isToday } from "date-fns";
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

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-24 flex-col gap-1 border p-1 ${dimmed ? "bg-muted/30 text-muted-foreground" : ""} ${isOver ? "bg-accent" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs ${isToday(date) ? "flex size-5 items-center justify-center rounded-full bg-foreground text-background" : ""}`}>
          {date.getDate()}
        </span>
        <button
          type="button"
          onClick={() => onAddEvent(date)}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label="Add event"
        >
          +
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
