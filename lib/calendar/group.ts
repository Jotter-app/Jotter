import { dayKey } from "@/lib/calendar/grid";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];

export function groupEventsByDay(events: Event[]): Map<string, Event[]> {
  const map = new Map<string, Event[]>();
  for (const event of events) {
    const key = dayKey(new Date(event.start_at));
    const existing = map.get(key) ?? [];
    existing.push(event);
    map.set(key, existing);
  }
  return map;
}

// Generic over whatever task shape the caller has on hand, rather than a
// single fixed summary type -- callers get back exactly the type they put
// in (a full task row, needed by TaskChip for edit/delete), no
// widening/narrowing at the call site.
export function groupTasksByDay<T extends { due_at: string }>(tasks: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const task of tasks) {
    const key = dayKey(new Date(task.due_at));
    const existing = map.get(key) ?? [];
    existing.push(task);
    map.set(key, existing);
  }
  return map;
}
