"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { FilePlus, Folder, FolderPlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NoteCard, type NoteCardData } from "@/components/notes/NoteCard";
import { createNote } from "@/lib/actions/notes";
import { createFolder } from "@/lib/actions/folders";

export interface NoteGroup {
  id: string | null;
  name: string;
  notes: NoteCardData[];
  /** Folders directly inside this one -- rendered as pill links at the top
   * of the group so a deep tree stays a step away, not just reachable
   * through the sidebar. Empty for a leaf folder or the "Unfiled" group. */
  childFolders: { id: string; name: string }[];
}

export function NotesDashboard({
  groups,
  hasAnyNotes,
  emptyMessage,
  activeFolderId,
}: {
  groups: NoteGroup[];
  /** Whether the account has any notes at all -- distinct from this
   * specific view (a folder, "Starred") having zero, which shouldn't claim
   * "you have no notes yet" when the sidebar's other views clearly do. */
  hasAnyNotes: boolean;
  /** Shown instead of the onboarding empty state when the account has
   * notes but this view has none -- contextual to what's being viewed
   * (a folder, "Starred"), computed by the page. */
  emptyMessage: string;
  /** The folder currently selected in the sidebar (via ?folder=), or null
   * on "All notes" / "Starred" -- where "Add note"/"Add folder" create. */
  activeFolderId: string | null;
}) {
  const [query, setQuery] = useState("");

  // Drops a group only when it's truly empty -- no notes (after search) AND
  // no child folders -- so a parent folder that's all subfolders and no
  // notes of its own (e.g. "Long-Form Scripts" containing "Finished") still
  // shows its subfolder pills instead of falling through to the
  // emptyMessage case, which is reserved for a view with nothing to show
  // at all (e.g. a genuinely empty "Starred").
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        notes: q
          ? group.notes.filter(
              (note) => note.title.toLowerCase().includes(q) || note.bodyMarkdown.toLowerCase().includes(q)
            )
          : group.notes,
      }))
      .filter((group) => group.notes.length > 0 || group.childFolders.length > 0);
  }, [groups, query]);

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="pl-9"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AddNoteButton folderId={activeFolderId} />
          <AddFolderButton parentFolderId={activeFolderId} />
        </div>
      </div>

      {!hasAnyNotes && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-accent-100 text-3xl">📝</span>
          <h2 className="font-heading text-xl">Capture it before it&apos;s gone</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Jot a note, and any line can turn into a task or calendar event -- create your first one from the
            sidebar.
          </p>
          <p className="rounded-full bg-muted px-4 py-2 text-xs">
            <span className="font-mono text-accent-700">/task</span> Call the vet <strong>Friday 9am</strong>
          </p>
        </div>
      )}

      {hasAnyNotes && filteredGroups.length === 0 && (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {query ? `No notes match "${query}".` : emptyMessage}
        </p>
      )}

      {filteredGroups.map((group) => (
        <div key={group.id ?? "unfiled"} className="flex flex-col gap-3">
          <h2 className="font-heading text-xl">{group.name}</h2>
          {group.childFolders.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {group.childFolders.map((folder) => (
                <Link
                  key={folder.id}
                  href={`/notes?folder=${folder.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-accent px-2.5 py-1 text-xs text-accent-700 hover:bg-accent-100"
                >
                  <Folder className="size-3" />
                  {folder.name}
                </Link>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// createNote() redirects on success (same shape NotesTree's own "+ note"
// row and QuickNoteLinks already use) so there's nothing to await here --
// startTransition just keeps the button from double-firing mid-navigation.
function AddNoteButton({ folderId }: { folderId: string | null }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => createNote(folderId))}
    >
      <FilePlus className="size-3.5" />
      Add note
    </Button>
  );
}

function AddFolderButton({ parentFolderId }: { parentFolderId: string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await createFolder(trimmed, parentFolderId);
      setName("");
      setOpen(false);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <FolderPlus className="size-3.5" />
        Add folder
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Folder name"
            className="h-8"
          />
          <Button type="submit" size="sm" disabled={isPending}>
            Create
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
