"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { Bold, Italic, Heading1, ListChecks, Link2, ChevronRight, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TagPicker } from "@/components/tags/TagPicker";
import { LinkedTasksPicker } from "@/components/notes/LinkedTasksPicker";
import { NoteBodyEditor, type NoteBodyEditorHandle } from "@/components/notes/NoteBodyEditor";
import { ExportLink } from "@/components/notes/ExportLink";
import { wrapSelection, toggleLinePrefix, insertLink } from "@/components/notes/editor/formattingCommands";
import type { WikilinkTarget } from "@/components/notes/editor/wikilinkPlugin";
import { saveNote, createNoteFromWikilink } from "@/lib/actions/notes";
import { toggleTaskComplete } from "@/lib/actions/tasks";
import type { WikilinkCandidate } from "@/lib/notes/resolveWikilink";
import type { Database } from "@/lib/supabase/database.types";

type Note = Database["public"]["Tables"]["notes"]["Row"];
type Tag = Database["public"]["Tables"]["tags"]["Row"];
type TaskOption = { id: string; title: string; completed_at: string | null; due_at: string | null };
type Backlink = { id: string; title: string };

export function NoteEditor({
  note,
  allTags,
  assignedTags,
  allTasks,
  linkedTasks,
  allNoteTitles,
  backlinks,
  breadcrumb,
}: {
  note: Note;
  allTags: Tag[];
  assignedTags: Tag[];
  allTasks: TaskOption[];
  linkedTasks: TaskOption[];
  allNoteTitles: WikilinkCandidate[];
  backlinks: Backlink[];
  breadcrumb: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body_markdown);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const bodyEditorRef = useRef<NoteBodyEditorHandle>(null);

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

  function handleToggleLinkedTask(taskId: string, checked: boolean, dueAt: string | null) {
    startTransition(() => toggleTaskComplete(taskId, checked, dueAt));
  }

  function handleWikilinkClick(target: WikilinkTarget) {
    if ("noteId" in target) {
      router.push(`/notes/${target.noteId}`);
      return;
    }
    startTransition(async () => {
      const result = await createNoteFromWikilink(target.brokenTitle);
      if (result.ok && result.noteId) router.push(`/notes/${result.noteId}`);
    });
  }

  function withView(fn: (view: NonNullable<ReturnType<NoteBodyEditorHandle["getView"]>>) => void) {
    const view = bodyEditorRef.current?.getView();
    if (view) fn(view);
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

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {breadcrumb.map((segment, i) => (
          <span key={segment.id} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3" />}
            <Link href={`/notes?folder=${segment.id}`} className="hover:text-foreground hover:underline">
              {segment.name}
            </Link>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Star className="size-4 text-muted-foreground" aria-hidden="true" />
          <ExportLink scope={{ type: "note", id: note.id }} />
        </div>
      </div>

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
        {backlinks.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Backlinks</span>
            <ul className="flex flex-wrap gap-1.5">
              {backlinks.map((backlink) => (
                <li key={backlink.id}>
                  <Link
                    href={`/notes/${backlink.id}`}
                    className="rounded-full border bg-muted px-2 py-0.5 text-xs hover:bg-accent"
                  >
                    {backlink.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <NoteBodyEditor
        ref={bodyEditorRef}
        value={body}
        onChange={(value) => {
          setBody(value);
          setDirty(true);
        }}
        placeholder={'Write in markdown... use #tags anywhere, or /task create "title" tomorrow 5pm on its own line to add a linked task'}
        className="min-h-96 w-full rounded-xl border bg-card p-3 text-sm shadow-sm outline-none focus-within:ring-3 focus-within:ring-ring/50"
        allNoteTitles={allNoteTitles}
        onWikilinkClick={handleWikilinkClick}
        linkedTasks={linkedTasks}
        onToggleLinkedTask={handleToggleLinkedTask}
      />

      <div className="flex items-center gap-1 rounded-full border bg-card px-2 py-1.5 shadow-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Bold"
          onClick={() => withView((view) => wrapSelection(view, "**"))}
        >
          <Bold />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Italic"
          onClick={() => withView((view) => wrapSelection(view, "*"))}
        >
          <Italic />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Heading"
          onClick={() => withView((view) => toggleLinePrefix(view, "# "))}
        >
          <Heading1 />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Checklist"
          onClick={() => withView((view) => toggleLinePrefix(view, "- [ ] "))}
        >
          <ListChecks />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Link"
          onClick={() => withView(insertLink)}
        >
          <Link2 />
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <Button size="sm" onClick={() => handleSave(false)} disabled={isPending || !dirty}>
            {isPending ? "Saving..." : "Save"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {dirty ? "Unsaved changes" : "Saved"}
            {linkedTasks.length > 0 &&
              ` · linked to ${linkedTasks.length} ${linkedTasks.length === 1 ? "task" : "tasks"}`}
          </span>
        </div>
      </div>
    </div>
  );
}
