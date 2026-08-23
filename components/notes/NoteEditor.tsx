"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TagPicker } from "@/components/tags/TagPicker";
import { saveNote } from "@/lib/actions/notes";
import type { Database } from "@/lib/supabase/database.types";

type Note = Database["public"]["Tables"]["notes"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];

export function NoteEditor({
  note,
  allTags,
  assignedTags,
}: {
  note: Note;
  allTags: Tag[];
  assignedTags: Tag[];
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
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-xs font-medium text-muted-foreground">Markdown</span>
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setDirty(true);
            }}
            placeholder="Write in markdown... use #tags anywhere in the text"
            className="min-h-96 rounded-xl border bg-card p-3 font-mono text-sm shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-xs font-medium text-muted-foreground">Preview</span>
          <div className="prose prose-sm min-h-96 max-w-none rounded-xl border bg-card p-3 shadow-sm dark:prose-invert">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {body || "*Nothing to preview yet.*"}
            </Markdown>
          </div>
        </div>
      </div>

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
