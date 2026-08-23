"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Native window.confirm() is suppressed in some automated/embedded browser
// contexts (and is poor UX/accessibility generally) -- this is the reusable
// replacement for any destructive action that needs a confirmation step
// (also used for folder deletion in the notes feature).
export function ConfirmDeleteButton({
  title,
  description,
  onConfirm,
  disabled,
  trigger,
}: {
  title: string;
  description?: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Custom trigger element (e.g. a compact "x" for an inline chip) in
   * place of the default "Delete" button. Rendered as-is via Base UI's
   * render prop -- its own content/styling is preserved. */
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <AlertDialogTrigger render={trigger} />
      ) : (
        <AlertDialogTrigger render={<Button size="sm" variant="ghost" disabled={disabled} />}>
          Delete
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
