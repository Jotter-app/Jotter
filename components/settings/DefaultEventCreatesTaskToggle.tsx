"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updateDefaultEventCreatesTask } from "@/lib/actions/settings";

export function DefaultEventCreatesTaskToggle({ initialValue }: { initialValue: boolean }) {
  const [checked, setChecked] = useState(initialValue);
  const [, startTransition] = useTransition();

  function handleChange(value: boolean) {
    setChecked(value);
    startTransition(() => updateDefaultEventCreatesTask(value));
  }

  return (
    <div className="flex items-start gap-4 rounded-2xl bg-card p-4 shadow-sm">
      <Switch id="default-event-creates-task" checked={checked} onCheckedChange={handleChange} className="mt-0.5" />
      <div className="flex flex-col gap-1">
        <Label htmlFor="default-event-creates-task">New calendar events also create a task by default</Label>
        <p className="text-xs text-muted-foreground">
          When on, the &quot;also add as a task&quot; option is pre-checked whenever you create an event --
          uncheck it per-event whenever you don&apos;t want that one linked.
        </p>
      </div>
    </div>
  );
}
