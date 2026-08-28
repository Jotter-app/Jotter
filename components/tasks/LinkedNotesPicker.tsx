"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PreviewCard, PreviewCardContent, PreviewCardTrigger } from "@/components/ui/preview-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkTaskNote, unlinkTaskNote } from "@/lib/actions/taskNoteLinks";
import { notePreviewSnippet } from "@/lib/notes/notePreviewSnippet";

type NoteOption = { id: string; title: string };
type LinkedNoteOption = NoteOption & { body_markdown: string; updated_at: string };

// Mirrors TagPicker's search-and-assign UX, minus the "create new" step --
// linking only ever attaches to an existing note, never creates one here.
export function LinkedNotesPicker({
  taskId,
  allNotes,
  linkedNotes,
}: {
  taskId: string;
  allNotes: NoteOption[];
  linkedNotes: LinkedNoteOption[];
}) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const linkedIds = new Set(linkedNotes.map((n) => n.id));
  const availableNotes = allNotes.filter(
    (n) => !linkedIds.has(n.id) && n.title.toLowerCase().includes(search.trim().toLowerCase())
  );

  function handleLink(noteId: string) {
    startTransition(() => linkTaskNote(taskId, noteId));
    setSearch("");
  }

  function handleUnlink(noteId: string) {
    startTransition(() => unlinkTaskNote(taskId, noteId));
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {linkedNotes.map((note) => (
        <span key={note.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
          <PreviewCard>
            <PreviewCardTrigger render={<Link href={`/notes/${note.id}`} className="hover:underline" />}>
              {note.title || "Untitled"}
            </PreviewCardTrigger>
            <PreviewCardContent>
              <p className="font-medium">{note.title || "Untitled"}</p>
              <p className="text-xs text-muted-foreground">
                Edited {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
              </p>
              <p className="text-xs text-muted-foreground">{notePreviewSnippet(note.body_markdown)}</p>
            </PreviewCardContent>
          </PreviewCard>
          <button
            type="button"
            onClick={() => handleUnlink(note.id)}
            aria-label={`Unlink ${note.title || "Untitled"}`}
            className="leading-none text-muted-foreground hover:text-foreground"
          >
            &times;
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-6 px-2 text-xs" />}>
          + link note
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2">
          <Input
            autoFocus
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {availableNotes.length > 0 ? (
            <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
              {availableNotes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-accent"
                    onClick={() => handleLink(note.id)}
                  >
                    {note.title || "Untitled"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 px-2 text-xs text-muted-foreground">
              {search.trim() ? "No matching notes." : "No notes to link yet."}
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
