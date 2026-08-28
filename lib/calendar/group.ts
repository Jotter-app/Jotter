import { dayKey } from "@/lib/calendar/grid";
import type { Database } from "@/lib/supabase/database.types";
import type { VirtualOccurrence } from "@/lib/calendar/expandRecurrence";

type Event = Database["public"]["Tables"]["events"]["Row"];

// `timeZone` is required on all three functions below -- see dayKey's doc
// comment. Bucketing an event/task by day using the executing runtime's
// ambient zone (rather than an explicit viewer zone) is the same class of
// bug as the calendar grid's own dates, just applied to which cell a chip
// renders under instead of the cell labels themselves.
export function groupEventsByDay(events: Event[], timeZone: string): Map<string, Event[]> {
  const map = new Map<string, Event[]>();
  for (const event of events) {
    const key = dayKey(new Date(event.start_at), timeZone);
    const existing = map.get(key) ?? [];
    existing.push(event);
    map.set(key, existing);
  }
  return map;
}

export function groupVirtualOccurrencesByDay(
  occurrences: VirtualOccurrence[],
  timeZone: string
): Map<string, VirtualOccurrence[]> {
  const map = new Map<string, VirtualOccurrence[]>();
  for (const occurrence of occurrences) {
    const key = dayKey(occurrence.startAt, timeZone);
    const existing = map.get(key) ?? [];
    existing.push(occurrence);
    map.set(key, existing);
  }
  return map;
}

// Generic over whatever task shape the caller has on hand, rather than a
// single fixed summary type -- callers get back exactly the type they put
// in (a full task row, needed by TaskChip for edit/delete), no
// widening/narrowing at the call site.
export function groupTasksByDay<T extends { due_at: string }>(tasks: T[], timeZone: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const task of tasks) {
    const key = dayKey(new Date(task.due_at), timeZone);
    const existing = map.get(key) ?? [];
    existing.push(task);
    map.set(key, existing);
  }
  return map;
}
