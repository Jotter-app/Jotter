"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updateHideNoteOnlyTags } from "@/lib/actions/settings";

export function HideNoteOnlyTagsToggle({ initialValue }: { initialValue: boolean }) {
  const [checked, setChecked] = useState(initialValue);
  const [, startTransition] = useTransition();

  function handleChange(value: boolean) {
    setChecked(value);
    startTransition(() => updateHideNoteOnlyTags(value));
  }

  return (
    <div className="flex items-start gap-4 rounded-2xl bg-card p-4 shadow-sm">
      <Switch id="hide-note-only-tags" checked={checked} onCheckedChange={handleChange} className="mt-0.5" />
      <div className="flex flex-col gap-1">
        <Label htmlFor="hide-note-only-tags">Hide tags that aren&apos;t used on any task</Label>
        <p className="text-xs text-muted-foreground">
          When on, a tag only shows up on the Tasks page once it&apos;s actually attached to a task -- note-only
          tags stay out of the way there (they&apos;re still manageable from the Notes page).
        </p>
      </div>
    </div>
  );
}
