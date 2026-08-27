"use client";

import { useTransition } from "react";
import { useDraggable } from "@dnd-kit/core";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { EventDeleteDialog } from "@/components/calendar/EventDeleteDialog";
import { toggleTaskComplete } from "@/lib/actions/tasks";
import { formatRelativeDays } from "@/lib/dates/relativeDays";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];
export type LinkedTask = { id: string; completed_at: string | null; due_at: string | null };

export function EventChip({ event, linkedTask }: { event: Event; linkedTask?: LinkedTask }) {
  const [, startTransition] = useTransition();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.id,
    data: { event },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            ref={setNodeRef}
            data-testid="event-chip"
            data-event-id={event.id}
            style={{ ...style, backgroundColor: event.calendar_color }}
            className={`block w-full truncate rounded-full px-2 py-0.5 text-left text-xs text-white ${isDragging ? "opacity-50" : ""}`}
            {...listeners}
            {...attributes}
          />
        }
      >
        {event.title}
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <p className="text-sm font-medium">{event.title}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeDays(new Date(event.start_at))} &middot;{" "}
          {format(new Date(event.start_at), "MMM d, h:mm a")} &ndash;{" "}
          {format(new Date(event.end_at), "h:mm a")}
        </p>
        {linkedTask && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <Checkbox
              checked={linkedTask.completed_at !== null}
              onCheckedChange={(checked) =>
                startTransition(() =>
                  toggleTaskComplete(linkedTask.id, checked === true, linkedTask.due_at)
                )
              }
            />
            Also a task -- mark complete
          </label>
        )}
        <div className="mt-2">
          <EventDeleteDialog eventId={event.id} eventTitle={event.title} hasLinkedTask={!!linkedTask} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
