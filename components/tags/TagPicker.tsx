"use client";

import { useState, useTransition } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assignExistingTag, createAndAssignTag, unassignTag, type TaggableType } from "@/lib/actions/tags";
import type { Database } from "@/lib/supabase/database.types";

type Tag = Database["public"]["Tables"]["tags"]["Row"];

// Reused for both tasks and notes -- the taggable vocabulary (tags table +
// taggables join) is shared across pillars, this is the one UI for it.
export function TagPicker({
  taggableId,
  taggableType,
  allTags,
  assignedTags,
}: {
  taggableId: string;
  taggableType: TaggableType;
  allTags: Tag[];
  assignedTags: Tag[];
}) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const assignedIds = new Set(assignedTags.map((t) => t.id));
  const availableTags = allTags.filter(
    (t) => !assignedIds.has(t.id) && t.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const exactMatch = allTags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  function handleAssign(tagId: string) {
    startTransition(() => assignExistingTag(tagId, taggableId, taggableType));
    setSearch("");
  }

  function handleCreate() {
    const name = search.trim();
    if (!name) return;
    startTransition(() => createAndAssignTag(name, taggableId, taggableType));
    setSearch("");
    setOpen(false);
  }

  function handleRemove(tagId: string) {
    startTransition(() => unassignTag(tagId, taggableId, taggableType));
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {assignedTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full border border-accent px-2 py-0.5 text-xs text-accent-700"
        >
          {tag.name}
          <button
            type="button"
            onClick={() => handleRemove(tag.id)}
            aria-label={`Remove ${tag.name}`}
            className="leading-none"
          >
            &times;
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-6 px-2 text-xs" />}>
          + tag
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2">
          <Input
            autoFocus
            placeholder="Search or create..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && search.trim() && !exactMatch) {
                e.preventDefault();
                handleCreate();
              }
            }}
          />
          {availableTags.length > 0 && (
            <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
              {availableTags.map((tag) => (
                <li key={tag.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent"
                    onClick={() => handleAssign(tag.id)}
                  >
                    {tag.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {search.trim() && !exactMatch && (
            <button
              type="button"
              className="mt-1 w-full rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent"
              onClick={handleCreate}
            >
              Create &quot;{search.trim()}&quot;
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
