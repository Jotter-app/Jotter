import { RRule } from "rrule";
import { dayKey } from "@/lib/calendar/grid";

export interface VirtualOccurrence {
  seriesId: string;
  title: string;
  calendarColor: string;
  startAt: Date;
  endAt: Date;
}

/**
 * Computes the virtual (not-yet-materialized) occurrences of a recurring
 * event within a date range, for calendar rendering only -- nothing here
 * touches the database. `alreadyMaterializedDateKeys` must include every
 * date that already has a real row in this series, including the master's
 * own start date -- rule.between() includes the rule's own dtstart as its
 * first occurrence, and the master is already a real, normally-rendered
 * row, not a virtual one.
 *
 * `timeZone` must match whatever zone the caller used to build
 * `alreadyMaterializedDateKeys` -- otherwise a materialized occurrence
 * could fail to match here and render twice.
 */
export function expandRecurringEvent(
  master: { id: string; title: string; start_at: string; end_at: string; calendar_color: string; recurrence_rule: string },
  alreadyMaterializedDateKeys: Set<string>,
  rangeStart: Date,
  rangeEnd: Date,
  timeZone: string
): VirtualOccurrence[] {
  const durationMs = new Date(master.end_at).getTime() - new Date(master.start_at).getTime();
  const rule = new RRule({ ...RRule.parseString(master.recurrence_rule), dtstart: new Date(master.start_at) });

  return rule
    .between(rangeStart, rangeEnd, true)
    .filter((date) => !alreadyMaterializedDateKeys.has(dayKey(date, timeZone)))
    .map((date) => ({
      seriesId: master.id,
      title: master.title,
      calendarColor: master.calendar_color,
      startAt: date,
      endAt: new Date(date.getTime() + durationMs),
    }));
}
