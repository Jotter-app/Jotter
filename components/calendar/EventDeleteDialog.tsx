"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { deleteEvent } from "@/lib/actions/events";

// An event with a linked task always asks what to do with it -- same
// "never silently orphan or destroy without an explicit choice" rule
// already used for folder deletion (see FolderDeleteDialog).
export function EventDeleteDialog({
  eventId,
  eventTitle,
  hasLinkedTask,
}: {
  eventId: string;
  eventTitle: string;
  hasLinkedTask: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!hasLinkedTask) {
    return (
      <ConfirmDeleteButton
        title={`Delete "${eventTitle}"?`}
        onConfirm={() => startTransition(() => deleteEvent(eventId, false))}
      />
    );
  }

  function handleDelete(deleteLinkedTask: boolean) {
    startTransition(async () => {
      await deleteEvent(eventId, deleteLinkedTask);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" disabled={isPending} />}>Delete</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &quot;{eventTitle}&quot;?</DialogTitle>
          <DialogDescription>This event has a linked task. Choose what to do with it.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleDelete(false)} disabled={isPending}>
            Keep task standalone
          </Button>
          <Button variant="destructive" onClick={() => handleDelete(true)} disabled={isPending}>
            Delete task too
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
