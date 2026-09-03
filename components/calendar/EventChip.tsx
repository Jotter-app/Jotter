"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { EventDeleteDialog } from "@/components/calendar/EventDeleteDialog";
import { TagPicker } from "@/components/tags/TagPicker";
import { toggleTaskComplete } from "@/lib/actions/tasks";
import { generateMeetingNote } from "@/lib/actions/events";
import { formatRelativeDays } from "@/lib/dates/relativeDays";
import { formatInTimeZone } from "@/lib/dates/formatInTimeZone";
import { useTimeZone } from "@/components/shared/TimeZoneProvider";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];
export type LinkedTask = { id: string; completed_at: string | null; due_at: string | null };

export function EventChip({
  event,
  linkedTask,
  allTags = [],
  assignedTags = [],
}: {
  event: Event;
  linkedTask?: LinkedTask;
  allTags?: Tag[];
  assignedTags?: Tag[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const timeZone = useTimeZone();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.id,
    data: { event },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  function handleGenerateNote() {
    startTransition(async () => {
      const result = await generateMeetingNote(event.id);
      if (result.ok && result.noteId) router.push(`/notes/${result.noteId}`);
    });
  }

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
        {event.calendar_connection_id && (
          <RefreshCw className="mr-1 inline size-2.5 shrink-0 align-[1px]" aria-label="Synced with Google Calendar" />
        )}
        {event.title}
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {event.title}
          {event.calendar_connection_id && (
            <RefreshCw className="size-3 shrink-0 text-muted-foreground" aria-label="Synced with Google Calendar" />
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeDays(new Date(event.start_at), timeZone)} &middot;{" "}
          {formatInTimeZone(new Date(event.start_at), timeZone, "MMM d, h:mm a")} &ndash;{" "}
          {formatInTimeZone(new Date(event.end_at), timeZone, "h:mm a")}
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
          <TagPicker taggableId={event.id} taggableType="event" allTags={allTags} assignedTags={assignedTags} />
        </div>
        <div className="mt-2">
          {event.linked_note_id ? (
            <Link href={`/notes/${event.linked_note_id}`} className="text-sm text-primary hover:underline">
              View meeting note
            </Link>
          ) : (
            <Button size="sm" variant="outline" onClick={handleGenerateNote} disabled={isPending}>
              {isPending ? "Generating..." : "Generate note"}
            </Button>
          )}
        </div>
        <div className="mt-2">
          <EventDeleteDialog eventId={event.id} eventTitle={event.title} hasLinkedTask={!!linkedTask} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
