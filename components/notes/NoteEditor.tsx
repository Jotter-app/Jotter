"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TagPicker } from "@/components/tags/TagPicker";
import { LinkedTasksPicker } from "@/components/notes/LinkedTasksPicker";
import { NoteBodyEditor } from "@/components/notes/NoteBodyEditor";
import { saveNote } from "@/lib/actions/notes";
import type { Database } from "@/lib/supabase/database.types";

type Note = Database["public"]["Tables"]["notes"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];
type TaskOption = { id: string; title: string; completed_at: string | null; due_at: string | null };

export function NoteEditor({
  note,
  allTags,
  assignedTags,
  allTasks,
  linkedTasks,
}: {
  note: Note;
  allTags: Tag[];
  assignedTags: Tag[];
  allTasks: TaskOption[];
  linkedTasks: TaskOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body_markdown);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);

  function handleSave(force = false) {
    startTransition(async () => {
      const result = await saveNote(note.id, title, body, note.updated_at, force);
      if (result.conflict) {
        setConflict(true);
        return;
      }
      setDirty(false);
      setConflict(false);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      {conflict && (
        <div className="flex items-center justify-between rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <span>This note was edited elsewhere since you opened it.</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => router.refresh()}>
              Reload latest (discard my changes)
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleSave(true)}>
              Overwrite anyway
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          placeholder="Untitled"
          className="border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
        />
        <TagPicker taggableId={note.id} taggableType="note" allTags={allTags} assignedTags={assignedTags} />
        <p className="text-xs text-muted-foreground">
          Created {format(new Date(note.created_at), "MMM d, yyyy")} &middot; Edited{" "}
          {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
        </p>
        <LinkedTasksPicker noteId={note.id} allTasks={allTasks} linkedTasks={linkedTasks} />
      </div>

      <NoteBodyEditor
        value={body}
        onChange={(value) => {
          setBody(value);
          setDirty(true);
        }}
        placeholder={'Write in markdown... use #tags anywhere, or /task create "title" tomorrow 5pm on its own line to add a linked task'}
        className="min-h-96 w-full rounded-xl border bg-card p-3 text-sm shadow-sm outline-none focus-within:ring-3 focus-within:ring-ring/50"
      />

      <div className="flex items-center gap-3">
        <Button onClick={() => handleSave(false)} disabled={isPending || !dirty}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : "Saved"}
        </span>
      </div>
    </div>
  );
}
