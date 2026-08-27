"use client";

import { useState, useTransition } from "react";
import { NotebookText, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderDeleteDialog } from "@/components/notes/FolderDeleteDialog";
import { createFolder, renameFolder, moveFolder } from "@/lib/actions/folders";
import { countNotesInSubtree, flattenForPicker, type FolderNode } from "@/lib/notes/tree";
import { notebookAccentClass } from "@/lib/notes/notebookAccent";

// A flat, always-expanded view of the same folder tree the sidebar renders
// nested -- the "bird's eye" list the mockup's management screen shows,
// reusing the sidebar's exact create/rename/move/delete actions rather
// than inventing new ones. No drag-to-reorder (see the design spec's
// addendum -- there's no persisted folder order to reorder into).
export function NotebookManageList({ roots }: { roots: FolderNode[] }) {
  const rows: { node: FolderNode; depth: number }[] = [];
  (function walk(nodes: FolderNode[], depth: number) {
    for (const node of nodes) {
      rows.push({ node, depth });
      walk(node.children, depth + 1);
    }
  })(roots, 0);

  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ node, depth }) => (
        <NotebookRow key={node.id} node={node} depth={depth} moveOptions={flattenForPicker(roots, node.id)} />
      ))}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No notebooks yet.</p>}
      <NewNotebookForm />
    </div>
  );
}

function NotebookRow({
  node,
  depth,
  moveOptions,
}: {
  node: FolderNode;
  depth: number;
  moveOptions: { id: string; label: string }[];
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(node.name);
  const [isPending, startTransition] = useTransition();
  const noteCount = countNotesInSubtree(node);

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
    <div className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm" style={{ marginLeft: depth * 28 }}>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
          depth === 0 ? notebookAccentClass(node.id) : "bg-neutral-200 text-neutral-700"
        }`}
      >
        <NotebookText className="size-4" />
      </span>
      <div className="flex-1">
        {renaming ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            className="h-7 max-w-56"
          />
        ) : (
          <button type="button" className="text-left text-sm font-semibold" onClick={() => setRenaming(true)}>
            {node.name}
          </button>
        )}
        <div className="text-xs text-muted-foreground">
          {noteCount} {noteCount === 1 ? "note" : "notes"}
          {depth > 0 && " · nested"}
        </div>
      </div>
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
      <FolderDeleteDialog
        folderId={node.id}
        folderName={node.name}
        hasContents={node.children.length > 0 || node.notes.length > 0}
        totalNoteCount={noteCount}
      />
    </div>
  );
}

function NewNotebookForm() {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="mt-2 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        startTransition(async () => {
          await createFolder(trimmed, null);
          setName("");
        });
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New notebook name"
        className="max-w-56"
      />
      <Button type="submit" size="sm" disabled={isPending}>
        <Plus /> New notebook
      </Button>
    </form>
  );
}
