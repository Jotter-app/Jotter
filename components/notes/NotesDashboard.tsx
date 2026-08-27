"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NoteCard, type NoteCardData } from "@/components/notes/NoteCard";

export interface NoteGroup {
  id: string | null;
  name: string;
  notes: NoteCardData[];
}

export function NotesDashboard({ groups }: { groups: NoteGroup[] }) {
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        notes: group.notes.filter(
          (note) => note.title.toLowerCase().includes(q) || note.bodyMarkdown.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.notes.length > 0);
  }, [groups, query]);

  const isEmpty = groups.every((group) => group.notes.length === 0);

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-auto p-6">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes…"
          className="pl-9"
        />
      </div>

      {isEmpty && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No notes yet -- create one from the sidebar.</p>}

      {!isEmpty && filteredGroups.length === 0 && (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No notes match &quot;{query}&quot;.
        </p>
      )}

      {filteredGroups.map((group) => (
        <div key={group.id ?? "unfiled"} className="flex flex-col gap-3">
          <h2 className="font-heading text-xl">{group.name}</h2>
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
