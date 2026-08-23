"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderDeleteDialog } from "@/components/notes/FolderDeleteDialog";
import { createFolder, renameFolder, moveFolder } from "@/lib/actions/folders";
import { createNote, deleteNote, moveNote } from "@/lib/actions/notes";
import { flattenForPicker, type FolderNode } from "@/lib/notes/tree";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";

type NoteSummary = { id: string; title: string; folder_id: string | null };

export function NotesTree({ roots, rootNotes }: { roots: FolderNode[]; rootNotes: NoteSummary[] }) {
  const allFolderOptions = flattenForPicker(roots);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        {roots.map((node) => (
          <FolderRow key={node.id} node={node} depth={0} allFolders={roots} />
        ))}
        {rootNotes.map((note) => (
          <NoteRow key={note.id} note={note} depth={0} allFolders={allFolderOptions} />
        ))}
      </div>
      <NewItemRow parentFolderId={null} />
    </div>
  );
}

function FolderRow({ node, depth, allFolders }: { node: FolderNode; depth: number; allFolders: FolderNode[] }) {
  const [expanded, setExpanded] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(node.name);
  const [isPending, startTransition] = useTransition();

  const moveOptions = flattenForPicker(allFolders, node.id);
  const hasContents = node.children.length > 0 || node.notes.length > 0;

  function handleRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === node.name) {
      setRenaming(false);
      return;
    }
    startTransition(async () => {
      await renameFolder(node.id, trimmed);
      setRenaming(false);
    });
  }

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="group/row flex items-center gap-1.5 rounded-md py-1 pr-1 hover:bg-accent/40">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>

        {expanded ? (
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Folder className="size-4 shrink-0 text-muted-foreground" />
        )}

        {renaming ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            className="h-7 max-w-48"
          />
        ) : (
          <button type="button" className="text-sm font-medium" onClick={() => setRenaming(true)}>
            {node.name}
          </button>
        )}

        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 has-[:focus]:opacity-100">
          <select
            className="rounded border bg-transparent text-xs text-muted-foreground"
            value=""
            disabled={isPending}
            onChange={(e) => {
              if (!e.target.value) return;
              const value = e.target.value === "__root__" ? null : e.target.value;
              startTransition(() => moveFolder(node.id, value));
            }}
          >
            <option value="" disabled>
              Move to...
            </option>
            <option value="__root__">Root</option>
            {moveOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          <FolderDeleteDialog folderId={node.id} folderName={node.name} hasContents={hasContents} />
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-1">
          {node.children.map((child) => (
            <FolderRow key={child.id} node={child} depth={depth + 1} allFolders={allFolders} />
          ))}
          {node.notes.map((note) => (
            <NoteRow key={note.id} note={note} depth={depth + 1} allFolders={flattenForPicker(allFolders)} />
          ))}
          <div style={{ marginLeft: (depth + 1) * 16 }}>
            <NewItemRow parentFolderId={node.id} />
          </div>
        </div>
      )}
    </div>
  );
}

function NoteRow({
  note,
  depth,
  allFolders,
}: {
  note: NoteSummary;
  depth: number;
  allFolders: { id: string; label: string }[];
}) {
  const [, startTransition] = useTransition();

  return (
    <div
      className="group/row flex items-center gap-1.5 rounded-md py-1 pr-1 hover:bg-accent/40"
      style={{ marginLeft: depth * 16 }}
    >
      <span className="size-4 shrink-0" />
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <Link href={`/notes/${note.id}`} className="flex-1 truncate text-sm hover:underline">
        {note.title || "Untitled"}
      </Link>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 has-[:focus]:opacity-100">
        <select
          className="rounded border bg-transparent text-xs text-muted-foreground"
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            const value = e.target.value === "__root__" ? null : e.target.value;
            startTransition(() => moveNote(note.id, value));
          }}
        >
          <option value="" disabled>
            Move to...
          </option>
          <option value="__root__">Root</option>
          {allFolders.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        <ConfirmDeleteButton
          title={`Delete "${note.title || "Untitled"}"?`}
          onConfirm={() => startTransition(() => deleteNote(note.id))}
        />
      </div>
    </div>
  );
}

function NewItemRow({ parentFolderId }: { parentFolderId: string | null }) {
  const [mode, setMode] = useState<"none" | "folder">("none");
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  if (mode === "folder") {
    return (
      <form
        className="flex items-center gap-2 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          startTransition(async () => {
            await createFolder(trimmed, parentFolderId);
            setName("");
            setMode("none");
          });
        }}
      >
        <span className="w-4" />
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder name"
          className="h-7 max-w-48"
        />
        <Button type="submit" size="sm" disabled={isPending}>
          Create
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode("none")}>
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground" style={{ marginLeft: 16 }}>
      <button
        type="button"
        onClick={() => setMode("folder")}
        className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
      >
        <Plus className="size-3" /> folder
      </button>
      <button
        type="button"
        onClick={() => startTransition(() => createNote(parentFolderId))}
        className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
      >
        <Plus className="size-3" /> note
      </button>
    </div>
  );
}
