"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { archiveAllCompletedTasks } from "@/lib/actions/tasks";

// No confirmation dialog, unlike delete -- archiving is reversible (see
// ArchivedTaskRow's Unarchive action), so the extra step isn't warranted.
export function ArchiveCompletedButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="ghost"
      // This button lives inside a <summary> (the Completed section's own
      // disclosure toggle) -- without stopping propagation, a click here
      // would also bubble up and toggle the details open/closed.
      onClick={(e) => {
        e.stopPropagation();
        startTransition(() => archiveAllCompletedTasks());
      }}
      disabled={isPending}
    >
      Archive completed
    </Button>
  );
}
