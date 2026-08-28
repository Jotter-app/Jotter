import Link from "next/link";
import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { TZDate } from "@date-fns/tz";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MonthView } from "@/components/calendar/MonthView";
import { WeekView } from "@/components/calendar/WeekView";
import { Button } from "@/components/ui/button";
import { getDefaultEventCreatesTask } from "@/lib/actions/settings";
import { getUserTimeZone } from "@/lib/dates/getUserTimeZone";
import { expandRecurringEvent, type VirtualOccurrence } from "@/lib/calendar/expandRecurrence";
import { dayKey } from "@/lib/calendar/grid";
import type { LinkedTask } from "@/components/calendar/EventChip";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

// `timeZone` is required -- see lib/calendar/grid.ts's doc comments. This
// Server Component never hydrates, so a wrong zone here doesn't throw a
// hydration error the way DayCell's would -- it silently shows the wrong
// month/week (and queries the wrong date range from the DB) for several
// hours around every day boundary between the server's zone (UTC on
// Vercel) and the viewer's own, with nothing client-side to correct it.
function parseAnchorDate(value: string | undefined, timeZone: string): Date {
  if (!value) return new TZDate(new Date(), timeZone);
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return new TZDate(new Date(), timeZone);
  // Re-anchors the parsed y/m/d as midnight *in the viewer's zone* rather
  // than midnight in whichever zone happened to parse the naive string --
  // that parse is itself ambient, but self-consistently so (it always
  // round-trips to the exact y/m/d written in `value`, regardless of which
  // zone performs it), so re-reading those components here is safe.
  return new TZDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), timeZone);
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = await searchParams;
  const view = params.view === "week" ? "week" : "month";
  const timeZone = await getUserTimeZone();
  const anchorDate = parseAnchorDate(typeof params.date === "string" ? params.date : undefined, timeZone);
  const today = new TZDate(new Date(), timeZone);

  const rangeStart = view === "month" ? startOfWeek(startOfMonth(anchorDate)) : startOfWeek(anchorDate);
  const rangeEnd = view === "month" ? endOfWeek(endOfMonth(anchorDate)) : endOfWeek(anchorDate);

  const supabase = await createClient();
  const [
    { data: events },
    { data: tasks },
    defaultEventCreatesTask,
    { data: tags },
    { data: eventTaggables },
    { data: unscheduledTasks },
    { data: seriesMasters },
  ] = await Promise.all([
    supabase
      .from("events")
      .select()
      .lte("start_at", rangeEnd.toISOString())
      .gte("end_at", rangeStart.toISOString()),
    supabase
      .from("tasks")
      .select()
      .not("due_at", "is", null)
      .is("completed_at", null)
      .gte("due_at", rangeStart.toISOString())
      .lte("due_at", rangeEnd.toISOString()),
    getDefaultEventCreatesTask(),
    supabase.from("tags").select().order("name"),
    supabase.from("taggables").select("taggable_id, tags(*)").eq("taggable_type", "event"),
    // Drag-to-timebox's drag source -- every not-yet-due, not-completed
    // task, regardless of the visible date range (an unscheduled task has
    // no due_at to fall inside or outside a range).
    supabase.from("tasks").select().is("due_at", null).is("completed_at", null).order("created_at"),
    // Every recurring series' master, regardless of its own date -- a
    // series created months ago must still generate this week's virtual
    // occurrences (Tier 5). Only ever set on a master row.
    supabase.from("events").select().not("recurrence_rule", "is", null),
  ]);

  const tagsByEventId = new Map<string, NonNullable<typeof tags>>();
  for (const row of eventTaggables ?? []) {
    if (!row.tags) continue;
    const existing = tagsByEventId.get(row.taggable_id) ?? [];
    existing.push(row.tags);
    tagsByEventId.set(row.taggable_id, existing);
  }

  const linkedTaskIds = (events ?? [])
    .map((e) => e.linked_task_id)
    .filter((id): id is string => id !== null);

  const { data: linkedTasks } = linkedTaskIds.length
    ? await supabase.from("tasks").select("id, completed_at, due_at").in("id", linkedTaskIds)
    : { data: [] as LinkedTask[] };
  const linkedTasksById = new Map((linkedTasks ?? []).map((t) => [t.id, t]));

  // A task linked to an event is already represented by that event's chip
  // -- showing it again in the plain tasks-due list would duplicate it in
  // the day cell.
  const tasksWithDueDate = (tasks ?? [])
    .filter((t): t is Task & { due_at: string } => t.due_at !== null)
    .filter((t) => !linkedTaskIds.includes(t.id));

  // Tier 5: compute this range's virtual (not-yet-materialized) occurrences
  // for each recurring series. Materialized dates -- including the
  // master's own, which is already a real row rendered normally -- come
  // from the events already fetched above, not a second query.
  const virtualOccurrences: VirtualOccurrence[] = (seriesMasters ?? []).flatMap((master) => {
    if (!master.recurrence_rule) return [];
    const materializedDateKeys = new Set(
      (events ?? []).filter((e) => e.series_id === master.id).map((e) => dayKey(new Date(e.start_at), timeZone))
    );
    materializedDateKeys.add(dayKey(new Date(master.start_at), timeZone));
    return expandRecurringEvent(
      { ...master, recurrence_rule: master.recurrence_rule },
      materializedDateKeys,
      rangeStart,
      rangeEnd,
      timeZone
    );
  });

  const prevAnchor = view === "month" ? subMonths(anchorDate, 1) : subWeeks(anchorDate, 1);
  const nextAnchor = view === "month" ? addMonths(anchorDate, 1) : addWeeks(anchorDate, 1);
  const dateParam = (d: Date) => format(d, "yyyy-MM-dd");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3 shadow-sm">
        <h1 className="pl-1 font-heading text-xl tracking-tight">
          {view === "month" ? format(anchorDate, "MMMM yyyy") : `Week of ${format(startOfWeek(anchorDate), "MMM d")}`}
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Link href={`/calendar?view=${view}&date=${dateParam(prevAnchor)}`}>
              <Button variant="outline" size="sm" aria-label="Previous">
                <ChevronLeft className="size-4" />
              </Button>
            </Link>
            <Link href={`/calendar?view=${view}&date=${dateParam(today)}`}>
              <Button variant="outline" size="sm">
                Today
              </Button>
            </Link>
            <Link href={`/calendar?view=${view}&date=${dateParam(nextAnchor)}`}>
              <Button variant="outline" size="sm" aria-label="Next">
                <ChevronRight className="size-4" />
              </Button>
            </Link>
          </div>
          <div data-slot="button-group" className="flex overflow-hidden rounded-full border">
            <Link href={`/calendar?view=month&date=${dateParam(anchorDate)}`}>
              <Button variant={view === "month" ? "default" : "ghost"} size="sm">
                Month
              </Button>
            </Link>
            <Link href={`/calendar?view=week&date=${dateParam(anchorDate)}`}>
              <Button variant={view === "week" ? "default" : "ghost"} size="sm">
                Week
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {view === "month" ? (
        <MonthView
          monthDate={anchorDate}
          events={events ?? []}
          tasksWithDueDate={tasksWithDueDate}
          linkedTasksById={linkedTasksById}
          defaultEventCreatesTask={defaultEventCreatesTask}
          allTags={tags ?? []}
          tagsByEventId={tagsByEventId}
          unscheduledTasks={unscheduledTasks ?? []}
          virtualOccurrences={virtualOccurrences}
        />
      ) : (
        <WeekView
          weekDate={anchorDate}
          events={events ?? []}
          tasksWithDueDate={tasksWithDueDate}
          linkedTasksById={linkedTasksById}
          defaultEventCreatesTask={defaultEventCreatesTask}
          allTags={tags ?? []}
          tagsByEventId={tagsByEventId}
          unscheduledTasks={unscheduledTasks ?? []}
          virtualOccurrences={virtualOccurrences}
        />
      )}
    </main>
  );
}
