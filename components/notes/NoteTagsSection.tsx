"use client";

import { useTransition } from "react";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { deleteTagGlobally } from "@/lib/actions/tags";
import type { Database } from "@/lib/supabase/database.types";

type Tag = Database["public"]["Tables"]["tags"]["Row"];

// Mirrors TagFilterRow's delete mechanism (ConfirmDeleteButton +
// deleteTagGlobally), but as a collapsible section like the Tasks page's
// Completed/Archived ones rather than a filter row -- the Notes page has
// no per-tag note filtering to link pills to, this is purely a management/
// delete surface for the note tag vocabulary (notably including tags
// hidden from the Tasks page's own list when they have no task attachment).
export function NoteTagsSection({ tags }: { tags: Tag[] }) {
  const [, startTransition] = useTransition();

  if (tags.length === 0) return null;

  function handleDelete(tagId: string) {
    startTransition(() => deleteTagGlobally(tagId));
  }

  return (
    <details className="group">
      <summary className="cursor-pointer text-[11px] font-semibold tracking-wide text-muted-foreground uppercase marker:content-none">
        <span className="inline-flex items-center gap-1.5">
          <span className="transition-transform group-open:rotate-90">&rsaquo;</span>
          Tags
          <span className="font-normal normal-case">{tags.length}</span>
        </span>
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full border border-accent px-2 py-0.5 text-[11px] text-accent-700"
          >
            {tag.name}
            <ConfirmDeleteButton
              title={`Delete tag "${tag.name}"?`}
              description="This removes it from every task and note that has it, not just this list."
              onConfirm={() => handleDelete(tag.id)}
              trigger={
                <button type="button" aria-label={`Delete tag ${tag.name}`} className="leading-none">
                  &times;
                </button>
              }
            />
          </span>
        ))}
      </div>
    </details>
  );
}
