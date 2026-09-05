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
import { deleteSection } from "@/lib/actions/sections";

// ProjectDeleteDialog's shape, one level down -- a section with tasks in it
// always asks what to do with them. Unlike deleting a whole project, this
// never navigates anywhere: the user stays on the same board afterward.
export function SectionDeleteDialog({
  sectionId,
  projectId,
  sectionName,
  hasTasks,
}: {
  sectionId: string;
  projectId: string;
  sectionName: string;
  hasTasks: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete(deleteTasks: boolean) {
    startTransition(async () => {
      await deleteSection(sectionId, projectId, deleteTasks);
      setOpen(false);
    });
  }

  if (!hasTasks) {
    return (
      <ConfirmDeleteButton
        title={`Delete "${sectionName}"?`}
        onConfirm={() => handleDelete(false)}
        disabled={isPending}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" disabled={isPending} />}>Delete</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &quot;{sectionName}&quot;?</DialogTitle>
          <DialogDescription>This section has tasks in it. Choose what to do with them.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleDelete(false)} disabled={isPending}>
            Keep tasks, move to No Section
          </Button>
          <Button variant="destructive" onClick={() => handleDelete(true)} disabled={isPending}>
            Delete tasks too
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
