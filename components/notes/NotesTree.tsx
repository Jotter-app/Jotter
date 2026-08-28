"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FolderDeleteDialog } from "@/components/notes/FolderDeleteDialog";
import { buildExportHref } from "@/components/notes/ExportLink";
import { createFolder, renameFolder, moveFolder } from "@/lib/actions/folders";
import { createNote, deleteNote, moveNote } from "@/lib/actions/notes";
import { countNotesInSubtree, flattenForPicker, type FolderNode } from "@/lib/notes/tree";
import { notebookAccentClass } from "@/lib/notes/notebookAccent";
import { ConfirmDeleteButton } from "@/components/shared/ConfirmDeleteButton";

type NoteSummary = { id: string; title: string; folder_id: string | null };

export function NotesTree({
  roots,
  rootNotes,
  activeFolderId,
}: {
  roots: FolderNode[];
  rootNotes: NoteSummary[];
  activeFolderId?: string;
}) {
  const allFolderOptions = flattenForPicker(roots);

  const isEmpty = roots.length === 0 && rootNotes.length === 0;

  return (
    <div className="flex flex-col gap-2">
      {isEmpty && (
        <p className="px-1 pb-1 text-sm text-muted-foreground">
          No notes yet -- create a folder or note below.
        </p>
      )}
      <div className="flex flex-col gap-1">
        {roots.map((node) => (
          <FolderRow key={node.id} node={node} depth={0} allFolders={roots} activeFolderId={activeFolderId} />
        ))}
        {rootNotes.map((note) => (
          <NoteRow key={note.id} note={note} depth={0} allFolders={allFolderOptions} />
        ))}
      </div>
      <NewItemRow parentFolderId={null} />
    </div>
  );
}

function FolderRow({
  node,
  depth,
  allFolders,
  activeFolderId,
}: {
  node: FolderNode;
  depth: number;
  allFolders: FolderNode[];
  activeFolderId?: string;
}) {
  // Only top-level folders start expanded -- a large imported vault can be
  // many levels deep, and expanding every folder at every depth by default
  // buries the tree in its own contents before the user can navigate it.
  const [expanded, setExpanded] = useState(depth === 0);
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
    // No margin here -- this div also wraps the recursively-rendered
    // children below, and each of those already carries its own depth*16
    // margin. Margin on this outer div too would compound at every level
    // (quadratically, not linearly), eventually shoving deeply-nested
    // rows so far right their titles render off the edge of the card.
    <div>
      <ContextMenu>
        <ContextMenuTrigger
          className={`group/row flex items-center gap-1.5 rounded-md py-1 pr-1 hover:bg-accent/40 ${
            activeFolderId === node.id ? "bg-accent-100" : ""
          }`}
          style={{ marginLeft: depth * 16 }}
        >
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>

          {depth === 0 ? (
            <Link
              href={`/notes?folder=${node.id}`}
              title={`View notes directly in ${node.name}`}
              className={`flex size-6 shrink-0 items-center justify-center rounded-full ${notebookAccentClass(node.id)}`}
            >
              {expanded ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />}
            </Link>
          ) : (
            <Link
              href={`/notes?folder=${node.id}`}
              title={`View notes directly in ${node.name}`}
              className="flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {expanded ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}
            </Link>
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
            <Link href={`/notes?folder=${node.id}`} className="text-sm font-medium">
              {node.name}
            </Link>
          )}

          <div className="ml-auto flex items-center opacity-0 transition-opacity group-hover/row:opacity-100 has-[:focus]:opacity-100">
            <FolderDeleteDialog
              folderId={node.id}
              folderName={node.name}
              hasContents={hasContents}
              totalNoteCount={countNotesInSubtree(node)}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setRenaming(true)}>Rename</ContextMenuItem>
          <ContextMenuItem render={<a href={buildExportHref({ type: "folder", id: node.id })} />}>
            Export
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem disabled={isPending} onClick={() => startTransition(() => moveFolder(node.id, null))}>
                Root
              </ContextMenuItem>
              {moveOptions.map((opt) => (
                <ContextMenuItem
                  key={opt.id}
                  disabled={isPending}
                  onClick={() => startTransition(() => moveFolder(node.id, opt.id))}
                >
                  {opt.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>

      {expanded && (
        <div className="flex flex-col gap-1">
          {node.children.map((child) => (
            <FolderRow
              key={child.id}
              node={child}
              depth={depth + 1}
              allFolders={allFolders}
              activeFolderId={activeFolderId}
            />
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
    <ContextMenu>
      <ContextMenuTrigger
        className="group/row flex items-center gap-1.5 rounded-md py-1 pr-1 hover:bg-accent/40"
        style={{ marginLeft: depth * 16 }}
      >
        <span className="size-4 shrink-0" />
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <Link href={`/notes/${note.id}`} className="flex-1 truncate text-sm hover:underline">
          {note.title || "Untitled"}
        </Link>
        <div className="flex items-center opacity-0 transition-opacity group-hover/row:opacity-100 has-[:focus]:opacity-100">
          <ConfirmDeleteButton
            title={`Delete "${note.title || "Untitled"}"?`}
            onConfirm={() => startTransition(() => deleteNote(note.id))}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem render={<a href={buildExportHref({ type: "note", id: note.id })} />}>Export</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => startTransition(() => moveNote(note.id, null))}>Root</ContextMenuItem>
            {allFolders.map((opt) => (
              <ContextMenuItem key={opt.id} onClick={() => startTransition(() => moveNote(note.id, opt.id))}>
                {opt.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
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

  // Hidden until this row (or one of its own buttons, for keyboard users)
  // is hovered/focused -- decluttering, since it otherwise sits permanently
  // visible under every expanded folder.
  return (
    <div
      className="group/newitem flex items-center gap-3 py-1 text-xs text-muted-foreground"
      style={{ marginLeft: 16 }}
    >
      <button
        type="button"
        onClick={() => setMode("folder")}
        className="inline-flex items-center gap-1 opacity-0 transition-opacity hover:text-foreground hover:underline group-hover/newitem:opacity-100 focus-visible:opacity-100"
      >
        <Plus className="size-3" /> folder
      </button>
      <button
        type="button"
        onClick={() => startTransition(() => createNote(parentFolderId))}
        className="inline-flex items-center gap-1 opacity-0 transition-opacity hover:text-foreground hover:underline group-hover/newitem:opacity-100 focus-visible:opacity-100"
      >
        <Plus className="size-3" /> note
      </button>
    </div>
  );
}
