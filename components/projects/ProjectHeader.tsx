"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { renameProject } from "@/lib/actions/projects";

// Inline-rename-on-click, same pattern as NotebookManageList's notebook
// rows -- click the name, it becomes an input, Enter/blur saves.
export function ProjectHeader({ projectId, name }: { projectId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [, startTransition] = useTransition();

  function handleSave() {
    const trimmed = value.trim();
    setEditing(false);
    if (!trimmed || trimmed === name) {
      setValue(name);
      return;
    }
    startTransition(() => renameProject(projectId, trimmed));
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
          }
          if (e.key === "Escape") {
            setValue(name);
            setEditing(false);
          }
        }}
        className="h-9 font-heading text-2xl tracking-tight"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left font-heading text-2xl tracking-tight hover:opacity-80"
    >
      {name}
    </button>
  );
}
