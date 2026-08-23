import { dayKey } from "@/lib/calendar/grid";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];
type TaskSummary = { id: string; title: string; due_at: string };

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

export function groupTasksByDay(tasks: TaskSummary[]): Map<string, TaskSummary[]> {
  const map = new Map<string, TaskSummary[]>();
  for (const task of tasks) {
    const key = dayKey(new Date(task.due_at));
    const existing = map.get(key) ?? [];
    existing.push(task);
    map.set(key, existing);
  }
  return map;
}
