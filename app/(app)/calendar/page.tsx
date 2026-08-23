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
import { createClient } from "@/lib/supabase/server";
import { MonthView } from "@/components/calendar/MonthView";
import { WeekView } from "@/components/calendar/WeekView";
import { Button } from "@/components/ui/button";

function parseAnchorDate(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = await searchParams;
  const view = params.view === "week" ? "week" : "month";
  const anchorDate = parseAnchorDate(typeof params.date === "string" ? params.date : undefined);

  const rangeStart = view === "month" ? startOfWeek(startOfMonth(anchorDate)) : startOfWeek(anchorDate);
  const rangeEnd = view === "month" ? endOfWeek(endOfMonth(anchorDate)) : endOfWeek(anchorDate);

  const supabase = await createClient();
  const [{ data: events }, { data: tasks }] = await Promise.all([
    supabase
      .from("events")
      .select()
      .lte("start_at", rangeEnd.toISOString())
      .gte("end_at", rangeStart.toISOString()),
    supabase
      .from("tasks")
      .select("id, title, due_at")
      .not("due_at", "is", null)
      .is("completed_at", null)
      .gte("due_at", rangeStart.toISOString())
      .lte("due_at", rangeEnd.toISOString()),
  ]);

  const tasksWithDueDate = (tasks ?? []).filter(
    (t): t is { id: string; title: string; due_at: string } => t.due_at !== null
  );

  const prevAnchor = view === "month" ? subMonths(anchorDate, 1) : subWeeks(anchorDate, 1);
  const nextAnchor = view === "month" ? addMonths(anchorDate, 1) : addWeeks(anchorDate, 1);
  const dateParam = (d: Date) => format(d, "yyyy-MM-dd");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {view === "month" ? format(anchorDate, "MMMM yyyy") : `Week of ${format(startOfWeek(anchorDate), "MMM d")}`}
        </h1>
        <div className="flex items-center gap-2">
          <Link href={`/calendar?view=${view}&date=${dateParam(prevAnchor)}`}>
            <Button variant="outline" size="sm">
              &larr; Prev
            </Button>
          </Link>
          <Link href={`/calendar?view=${view}&date=${dateParam(new Date())}`}>
            <Button variant="outline" size="sm">
              Today
            </Button>
          </Link>
          <Link href={`/calendar?view=${view}&date=${dateParam(nextAnchor)}`}>
            <Button variant="outline" size="sm">
              Next &rarr;
            </Button>
          </Link>
          <div className="ml-2 flex gap-1 rounded-md border p-0.5">
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
        <MonthView monthDate={anchorDate} events={events ?? []} tasksWithDueDate={tasksWithDueDate} />
      ) : (
        <WeekView weekDate={anchorDate} events={events ?? []} tasksWithDueDate={tasksWithDueDate} />
      )}
    </main>
  );
}
