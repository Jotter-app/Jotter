"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createSection } from "@/lib/actions/sections";

// Shared by the list view (where it's the only way to create a project's
// first section, switching that project into board view) and ProjectBoard
// (as the trailing "add a list" column) -- same inline reveal-an-input
// affordance either way, just different surrounding layout.
export function AddSectionButton({ projectId, className }: { projectId: string; className?: string }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [, startTransition] = useTransition();

  function handleCreate() {
    const trimmed = name.trim();
    setAdding(false);
    setName("");
    if (!trimmed) return;
    startTransition(() => {
      createSection(projectId, trimmed);
    });
  }

  if (adding) {
    return (
      <Input
        autoFocus
        placeholder="Section name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleCreate}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleCreate();
          }
          if (e.key === "Escape") {
            setName("");
            setAdding(false);
          }
        }}
        className={className}
      />
    );
  }

  return (
    <Button variant="outline" onClick={() => setAdding(true)} className={className}>
      <Plus className="size-4" />
      Add section
    </Button>
  );
}
