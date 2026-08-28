"use server";

import { currentUserId } from "@/lib/supabase/session";
import { dayKey } from "@/lib/calendar/grid";
import { getUserTimeZone } from "@/lib/dates/getUserTimeZone";

export interface SearchResult {
  type: "note" | "task" | "event";
  id: string;
  title: string;
  /** yyyy-MM-dd, events only -- lets the result link straight to the
   * calendar week/month containing it. */
  dateKey?: string;
}

// Separate ilike() calls per column rather than a single .or("a.ilike.%x%,b.ilike.%x%")
// string: .or() takes a raw PostgREST filter string, and splicing arbitrary
// user input into it (commas/periods have syntactic meaning there) is
// fragile even though RLS still bounds the blast radius to the user's own
// rows. .ilike() takes its pattern as a normal parameterized argument.
export async function search(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { supabase, userId } = await currentUserId();
  if (!userId) return [];

  const timeZone = await getUserTimeZone();
  const pattern = `%${trimmed}%`;

  const [notesByTitle, notesByBody, tasksByTitle, tasksByNotes, eventsByTitle] = await Promise.all([
    supabase.from("notes").select("id, title").ilike("title", pattern).limit(10),
    supabase.from("notes").select("id, title").ilike("body_markdown", pattern).limit(10),
    supabase.from("tasks").select("id, title").ilike("title", pattern).limit(10),
    supabase.from("tasks").select("id, title").ilike("notes", pattern).limit(10),
    supabase.from("events").select("id, title, start_at").ilike("title", pattern).limit(10),
  ]);

  const notes = new Map<string, string>();
  for (const n of [...(notesByTitle.data ?? []), ...(notesByBody.data ?? [])]) {
    notes.set(n.id, n.title || "Untitled");
  }

  const tasks = new Map<string, string>();
  for (const t of [...(tasksByTitle.data ?? []), ...(tasksByNotes.data ?? [])]) {
    tasks.set(t.id, t.title);
  }

  const events = new Map<string, { title: string; dateKey: string }>();
  for (const e of eventsByTitle.data ?? []) {
    events.set(e.id, { title: e.title, dateKey: dayKey(new Date(e.start_at), timeZone) });
  }

  return [
    ...[...notes].map(([id, title]) => ({ type: "note" as const, id, title })),
    ...[...tasks].map(([id, title]) => ({ type: "task" as const, id, title })),
    ...[...events].map(([id, { title, dateKey }]) => ({ type: "event" as const, id, title, dateKey })),
  ];
}
