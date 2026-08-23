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
import { deleteFolder } from "@/lib/actions/folders";

// A folder with contents always asks which way to handle them -- notes
// must never be silently orphaned or destroyed without an explicit choice.
export function FolderDeleteDialog({
  folderId,
  folderName,
  hasContents,
}: {
  folderId: string;
  folderName: string;
  hasContents: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete(mode: "cascade" | "move-to-parent") {
    startTransition(async () => {
      await deleteFolder({ folderId, mode });
      setOpen(false);
    });
  }

  if (!hasContents) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => startTransition(() => deleteFolder({ folderId, mode: "cascade" }))}
      >
        Delete
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>Delete</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &quot;{folderName}&quot;?</DialogTitle>
          <DialogDescription>
            This folder has sub-folders or notes inside it. Choose what to do with them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleDelete("move-to-parent")} disabled={isPending}>
            Move contents up
          </Button>
          <Button variant="destructive" onClick={() => handleDelete("cascade")} disabled={isPending}>
            Delete everything
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
