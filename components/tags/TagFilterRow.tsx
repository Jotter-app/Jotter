"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";
import { deleteTagGlobally } from "@/lib/actions/tags";
import type { Database } from "@/lib/supabase/database.types";

type Tag = Database["public"]["Tables"]["tags"]["Row"];

// Deleting from here removes the tag entirely (every task/note that has
// it loses it), unlike the per-item "x" on a task/note which only
// unassigns it there -- see deleteTagGlobally's doc comment.
export function TagFilterRow({ allTags, activeTagId }: { allTags: Tag[]; activeTagId?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleDelete(tag: Tag) {
    startTransition(async () => {
      await deleteTagGlobally(tag.id);
      if (activeTagId === tag.id) {
        router.push("/tasks");
      }
    });
  }

  if (allTags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Link
        href="/tasks"
        className={`rounded-full px-2 py-0.5 ${!activeTagId ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
      >
        All
      </Link>
      {allTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-white"
          style={{
            backgroundColor: tag.color,
            opacity: activeTagId && activeTagId !== tag.id ? 0.4 : 1,
          }}
        >
          <Link href={`/tasks?tag=${tag.id}`}>{tag.name}</Link>
          <ConfirmDeleteButton
            title={`Delete tag "${tag.name}"?`}
            description="This removes it from every task and note that has it, not just this list."
            onConfirm={() => handleDelete(tag)}
            trigger={
              <button type="button" aria-label={`Delete tag ${tag.name}`} className="leading-none">
                &times;
              </button>
            }
          />
        </span>
      ))}
    </div>
  );
}
