"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
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
import { parseImplicit } from "@/lib/jotter/parseImplicit";
import { parseExplicit } from "@/lib/jotter/parseExplicit";
import { dispatchJotter } from "@/lib/jotter/dispatch";
import type { JotterIntent, JotterRoute } from "@/lib/jotter/types";

const ROUTE_LABEL: Record<JotterRoute, string> = { task: "Task", event: "Event", note: "Note" };
const PILLARS: JotterRoute[] = ["task", "event", "note"];

function formatIntentPreview(intent: JotterIntent): string {
  const parts = [intent.title || "(untitled)"];
  if (intent.dueAt) parts.push(`due ${format(intent.dueAt, "MMM d, h:mm a")}`);
  if (intent.endAt) parts.push(`until ${format(intent.endAt, "h:mm a")}`);
  if (intent.tags.length) parts.push(intent.tags.map((t) => `#${t}`).join(" "));
  return parts.join(" — ");
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!trimmed || trimmed.startsWith("/")) return;
    const timeout = setTimeout(() => {
      search(trimmed).then(setResults);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  // Rather than clearing `results` synchronously in the effect above when
  // the query empties out (which would be a setState-in-effect footgun),
  // just don't show stale results once the query is cleared.
  const activeResults = query.trim() && !query.trim().startsWith("/") ? results : [];

  function goTo(result: SearchResult) {
    close();
    if (result.type === "note") {
      router.push(`/notes/${result.id}`);
    } else if (result.type === "event") {
      router.push(`/calendar?date=${result.dateKey}`);
    } else {
      router.push("/tasks");
    }
  }

  function close() {
    setOpen(false);
    setQuery("");
    setCommandError(null);
  }

  function insertTemplate(route: JotterRoute) {
    const template = `/${route} create "`;
    setQuery(template);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(template.length, template.length);
    });
  }

  function handleCreate(routeOverride?: JotterRoute) {
    setCommandError(null);
    startTransition(async () => {
      const result = await dispatchJotter(query, routeOverride);
      if (!result.ok) {
        setCommandError(result.error);
        return;
      }
      close();
      if (result.redirectTo) router.push(result.redirectTo);
      else router.refresh();
    });
  }

  const trimmedQuery = query.trim();
  const isCommand = trimmedQuery.startsWith("/");
  const pillarMatch = isCommand ? trimmedQuery.match(/^\/(task|event|note)\b/i) : null;
  const explicitRoute = pillarMatch ? (pillarMatch[1].toLowerCase() as JotterRoute) : null;
  const explicitParse = explicitRoute ? parseExplicit(trimmedQuery) : null;
  const implicitIntent = !isCommand && trimmedQuery ? parseImplicit(trimmedQuery) : null;

  const notes = activeResults.filter((r) => r.type === "note");
  const tasks = activeResults.filter((r) => r.type === "task");
  const events = activeResults.filter((r) => r.type === "event");

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="text-muted-foreground">
        Search... <kbd className="ml-2 text-xs">Ctrl+K</kbd>
      </Button>
      {/* shouldFilter=false: results (search, and the routing/command items
          computed above) are already the correct set -- cmdk's own fuzzy
          filter would otherwise re-score each item against its derived
          value and can hide correct results/hide items with no plain-text
          overlap with the query (e.g. a "Create event" item). */}
      <CommandDialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())} shouldFilter={false}>
        <CommandInput
          ref={inputRef}
          placeholder='Search, or type / for commands ("/task create ...")'
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {!isCommand && (
            <>
              {implicitIntent && (
                <CommandGroup heading="Create">
                  <CommandItem value="__create_primary" onSelect={() => handleCreate()} disabled={isPending}>
                    Create {ROUTE_LABEL[implicitIntent.route].toLowerCase()}: {formatIntentPreview(implicitIntent)}
                  </CommandItem>
                  {/* A detected time range/duration is the one genuinely
                      ambiguous signal implicit routing adds -- offer the
                      task alternative right there instead of silently
                      committing to "event". */}
                  {implicitIntent.route === "event" && (
                    <CommandItem
                      value="__create_alt_task"
                      onSelect={() => handleCreate("task")}
                      disabled={isPending}
                    >
                      Create task instead: {implicitIntent.title || "(untitled)"}
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
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
            </>
          )}
          {isCommand && !explicitRoute && (
            <CommandGroup heading="Create">
              {PILLARS.map((route) => (
                <CommandItem key={route} value={`__pillar_${route}`} onSelect={() => insertTemplate(route)}>
                  /{route} create ... -- new {route}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {isCommand && explicitRoute && explicitParse?.ok && explicitParse.intent && (
            <CommandGroup heading="Create">
              <CommandItem value="__command_preview" onSelect={() => handleCreate()} disabled={isPending}>
                Create {ROUTE_LABEL[explicitParse.intent.route].toLowerCase()}: {formatIntentPreview(explicitParse.intent)}
              </CommandItem>
            </CommandGroup>
          )}
          {isCommand && explicitRoute && explicitParse && !explicitParse.ok && (
            <p className="px-3 py-4 text-sm text-muted-foreground">{explicitParse.error}</p>
          )}
          {commandError && <p className="px-3 pb-2 text-sm text-destructive">{commandError}</p>}
        </CommandList>
      </CommandDialog>
    </>
  );
}
