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
import { localDatetimeInputToUtcIso } from "@/lib/dates/localDatetimeInputToUtcIso";

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";
const initialState: EventFormState = { error: null };

export function AddEventDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultEventCreatesTask = false,
  googleCalendarConnected = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: Date;
  defaultEventCreatesTask?: boolean;
  googleCalendarConnected?: boolean;
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
        <form
          action={formAction}
          onSubmit={(e) => {
            // The visible datetime-local inputs are timezone-naive by HTML
            // spec, so they're never submitted directly -- each one's raw
            // value is converted to a UTC ISO string here, client-side
            // (parsing it anywhere else would use that runtime's timezone,
            // not the user's), and mirrored into a hidden field carrying
            // the real startAt/endAt names createEvent reads. This is the
            // same bug/fix as TaskEditForm's dueAt, just via a native form
            // action instead of a manually-built FormData.
            const form = e.currentTarget;
            const startVisible = form.elements.namedItem("startAtLocal") as HTMLInputElement;
            const endVisible = form.elements.namedItem("endAtLocal") as HTMLInputElement;
            const startHidden = form.elements.namedItem("startAt") as HTMLInputElement;
            const endHidden = form.elements.namedItem("endAt") as HTMLInputElement;
            startHidden.value = localDatetimeInputToUtcIso(startVisible.value) ?? "";
            endHidden.value = localDatetimeInputToUtcIso(endVisible.value) ?? "";
          }}
        >
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
              <Input id="event-start" name="startAtLocal" type="datetime-local" defaultValue={defaultStart} required />
              <input type="hidden" name="startAt" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-end">Ends</Label>
              <Input id="event-end" name="endAtLocal" type="datetime-local" defaultValue={defaultEnd} required />
              <input type="hidden" name="endAt" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="event-also-task" name="alsoCreateTask" defaultChecked={defaultEventCreatesTask} />
              <Label htmlFor="event-also-task">Also add as a task</Label>
            </div>
            {googleCalendarConnected && (
              <div className="flex items-center gap-2">
                <Checkbox id="event-sync-google" name="syncToGoogle" defaultChecked={false} />
                <Label htmlFor="event-sync-google">Sync to Google Calendar</Label>
              </div>
            )}
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
