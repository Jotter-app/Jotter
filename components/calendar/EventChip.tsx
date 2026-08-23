"use client";

import { useTransition } from "react";
import { useDraggable } from "@dnd-kit/core";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { deleteEvent } from "@/lib/actions/events";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];

export function EventChip({ event }: { event: Event }) {
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
            className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs text-white ${isDragging ? "opacity-50" : ""}`}
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
          {format(new Date(event.start_at), "MMM d, h:mm a")} &ndash;{" "}
          {format(new Date(event.end_at), "h:mm a")}
        </p>
        <div className="mt-2">
          <ConfirmDeleteButton
            title={`Delete "${event.title}"?`}
            onConfirm={() => startTransition(() => deleteEvent(event.id))}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
