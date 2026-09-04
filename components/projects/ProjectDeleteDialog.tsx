"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { deleteProject } from "@/lib/actions/projects";

// A project with tasks in it always asks what to do with them -- same
// "never silently orphan or destroy without an explicit choice" rule as
// EventDeleteDialog (for a linked task) and FolderDeleteDialog (for notes).
// No "move to" option here, unlike folders: projects are flat, so there's
// no parent to move orphaned tasks up into.
export function ProjectDeleteDialog({ projectId, projectName, hasTasks }: { projectId: string; projectName: string; hasTasks: boolean }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete(deleteTasks: boolean) {
    startTransition(async () => {
      await deleteProject(projectId, deleteTasks);
      setOpen(false);
      router.push("/projects");
    });
  }

  if (!hasTasks) {
    return <ConfirmDeleteButton title={`Delete "${projectName}"?`} onConfirm={() => handleDelete(false)} disabled={isPending} />;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" disabled={isPending} />}>Delete</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &quot;{projectName}&quot;?</DialogTitle>
          <DialogDescription>This project has tasks in it. Choose what to do with them.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleDelete(false)} disabled={isPending}>
            Keep tasks, unfiled
          </Button>
          <Button variant="destructive" onClick={() => handleDelete(true)} disabled={isPending}>
            Delete tasks too
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
