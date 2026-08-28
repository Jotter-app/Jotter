"use client";

import { useActionState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { createEvent, type EventFormState } from "@/lib/actions/events";

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";
const initialState: EventFormState = { error: null };

export function AddEventDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultEventCreatesTask = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: Date;
  defaultEventCreatesTask?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createEvent, initialState);

  // Track whether a submission actually happened, since the initial state
  // is also {error: null} -- without this, the dialog would close itself
  // immediately on mount instead of only after a successful create.
  const hasSubmitted = useRef(false);
  useEffect(() => {
    if (pending) hasSubmitted.current = true;
  }, [pending]);
  useEffect(() => {
    if (hasSubmitted.current && !pending && state.error === null) {
      hasSubmitted.current = false;
      onOpenChange(false);
    }
  }, [pending, state, onOpenChange]);

  const defaultStart = format(defaultDate, DATETIME_LOCAL_FORMAT);
  const defaultEndDate = new Date(defaultDate);
  defaultEndDate.setHours(defaultEndDate.getHours() + 1);
  const defaultEnd = format(defaultEndDate, DATETIME_LOCAL_FORMAT);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>New event</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-title">Title</Label>
              <Input id="event-title" name="title" required autoFocus />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-start">Starts</Label>
              <Input id="event-start" name="startAt" type="datetime-local" defaultValue={defaultStart} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-end">Ends</Label>
              <Input id="event-end" name="endAt" type="datetime-local" defaultValue={defaultEnd} required />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="event-also-task" name="alsoCreateTask" defaultChecked={defaultEventCreatesTask} />
              <Label htmlFor="event-also-task">Also add as a task</Label>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-repeats">Repeats</Label>
              <select
                id="event-repeats"
                name="repeats"
                defaultValue="none"
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
