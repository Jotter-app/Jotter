"use client";

import { useTransition } from "react";
import { CalendarClock, NotebookPen } from "lucide-react";
import { openTodaysDailyNote } from "@/lib/actions/dailyNote";
import { openThisWeeksReview } from "@/lib/actions/weeklyReview";

// Both actions get-or-create then redirect() -- same "button calling a
// redirect-throwing server action via startTransition" shape NotesTree's
// own "+ note" button already uses for createNote.
export function QuickNoteLinks() {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium hover:bg-accent/40"
        onClick={() => startTransition(() => openTodaysDailyNote())}
      >
        <NotebookPen className="size-3.5" />
        Today&apos;s Note
      </button>
      <button
        type="button"
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium hover:bg-accent/40"
        onClick={() => startTransition(() => openThisWeeksReview())}
      >
        <CalendarClock className="size-3.5" />
        This Week
      </button>
    </div>
  );
}
