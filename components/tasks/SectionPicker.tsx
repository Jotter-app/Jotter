"use client";

import { useState, useTransition } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assignTaskSection } from "@/lib/actions/sections";
import type { Database } from "@/lib/supabase/database.types";

type Section = Database["public"]["Tables"]["sections"]["Row"];

// ProjectPicker's popover-with-search shape, adapted to sections -- a task
// belongs to at most one section within its project, same exclusive
// (not many-to-many) relationship project_id already has.
export function SectionPicker({
  taskId,
  projectId,
  allSections,
  currentSection,
}: {
  taskId: string;
  projectId: string;
  allSections: Section[];
  currentSection: Section | null;
}) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const otherSections = allSections
    .filter((s) => s.id !== currentSection?.id)
    .filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));

  function handlePick(sectionId: string | null) {
    startTransition(() => assignTaskSection(taskId, sectionId, projectId));
    setSearch("");
    setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {currentSection && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
          {currentSection.name}
          <button
            type="button"
            onClick={() => handlePick(null)}
            aria-label={`Remove from ${currentSection.name}`}
            className="leading-none"
          >
            &times;
          </button>
        </span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-6 px-2 text-xs" />}>
          {currentSection ? "change section" : "+ section"}
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2">
          <Input autoFocus placeholder="Search sections..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {(currentSection || otherSections.length > 0) && (
            <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
              {currentSection && (
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent"
                    onClick={() => handlePick(null)}
                  >
                    No section
                  </button>
                </li>
              )}
              {otherSections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent"
                    onClick={() => handlePick(section.id)}
                  >
                    {section.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
