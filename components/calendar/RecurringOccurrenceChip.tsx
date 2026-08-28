"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { materializeOccurrenceAndGenerateNote } from "@/lib/actions/events";
import { formatRelativeDays } from "@/lib/dates/relativeDays";
import { formatInTimeZone } from "@/lib/dates/formatInTimeZone";
import { useTimeZone } from "@/components/shared/TimeZoneProvider";
import type { VirtualOccurrence } from "@/lib/calendar/expandRecurrence";

// A virtual occurrence isn't a real row yet, so it deliberately has none of
// EventChip's affordances that only make sense once it is: no drag (nothing
// to reschedule), no TagPicker (nothing to tag), no delete (nothing to
// delete). The one thing you can do -- generate its note -- is exactly what
// materializes it into a real event, at which point the calendar's next
// load renders it as an ordinary EventChip instead of this component.
export function RecurringOccurrenceChip({ occurrence }: { occurrence: VirtualOccurrence }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const timeZone = useTimeZone();

  function handleGenerateNote() {
    startTransition(async () => {
      const result = await materializeOccurrenceAndGenerateNote(
        occurrence.seriesId,
        occurrence.startAt.toISOString(),
        occurrence.endAt.toISOString()
      );
      if (result.ok && result.noteId) router.push(`/notes/${result.noteId}`);
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            style={{ backgroundColor: occurrence.calendarColor }}
            className="block w-full truncate rounded-full px-2 py-0.5 text-left text-xs text-white opacity-60"
          />
        }
      >
        {occurrence.title}
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <p className="text-sm font-medium">{occurrence.title}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeDays(occurrence.startAt, timeZone)} &middot;{" "}
          {formatInTimeZone(occurrence.startAt, timeZone, "MMM d, h:mm a")} &ndash;{" "}
          {formatInTimeZone(occurrence.endAt, timeZone, "h:mm a")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Not yet scheduled &mdash; part of a recurring series.</p>
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={handleGenerateNote} disabled={isPending}>
            {isPending ? "Generating..." : "Generate note"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
