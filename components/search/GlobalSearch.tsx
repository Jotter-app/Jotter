"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { search, type SearchResult } from "@/lib/actions/search";

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const timeout = setTimeout(() => {
      search(trimmed).then(setResults);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  // Rather than clearing `results` synchronously in the effect above when
  // the query empties out (which would be a setState-in-effect footgun),
  // just don't show stale results once the query is cleared.
  const activeResults = query.trim() ? results : [];

  function goTo(result: SearchResult) {
    setOpen(false);
    setQuery("");
    if (result.type === "note") {
      router.push(`/notes/${result.id}`);
    } else if (result.type === "event") {
      router.push(`/calendar?date=${result.dateKey}`);
    } else {
      router.push("/tasks");
    }
  }

  const notes = activeResults.filter((r) => r.type === "note");
  const tasks = activeResults.filter((r) => r.type === "task");
  const events = activeResults.filter((r) => r.type === "event");

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="text-muted-foreground">
        Search... <kbd className="ml-2 text-xs">Ctrl+K</kbd>
      </Button>
      {/* shouldFilter=false: results are already filtered server-side by
          `search()` -- cmdk's own fuzzy filter would otherwise re-score
          each item against its derived value and can hide correct results. */}
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          placeholder="Search notes and tasks..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {query.trim() && activeResults.length === 0 && <CommandEmpty>No results found.</CommandEmpty>}
          {notes.length > 0 && (
            <CommandGroup heading="Notes">
              {notes.map((r) => (
                <CommandItem key={r.id} value={r.id} onSelect={() => goTo(r)}>
                  {r.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {tasks.length > 0 && (
            <CommandGroup heading="Tasks">
              {tasks.map((r) => (
                <CommandItem key={r.id} value={r.id} onSelect={() => goTo(r)}>
                  {r.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {events.length > 0 && (
            <CommandGroup heading="Calendar">
              {events.map((r) => (
                <CommandItem key={r.id} value={r.id} onSelect={() => goTo(r)}>
                  {r.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
