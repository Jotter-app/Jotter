import { describe, expect, it } from "vitest";
import { expandRecurringEvent } from "@/lib/calendar/expandRecurrence";
import { dayKey } from "@/lib/calendar/grid";

// Matches whichever timezone actually parses the naive (no offset/"Z") date
// strings below via `new Date(...)` -- master.start_at/end_at are parsed
// ambiently inside expandRecurringEvent itself (RRule's dtstart), so reading
// results back out through this SAME zone round-trips to the calendar days
// written below, regardless of which host or CI machine runs this suite.
const HOST_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// A Wednesday, 10am-11am -- 1 hour duration, used to check endAt tracks
// the master's own duration on every expanded occurrence.
function weeklyMaster(overrides: Partial<{ start_at: string; end_at: string; recurrence_rule: string }> = {}) {
  return {
    id: "master-1",
    title: "Team Sync",
    calendar_color: "#7a8a5e",
    start_at: "2026-08-26T10:00:00",
    end_at: "2026-08-26T11:00:00",
    recurrence_rule: "FREQ=WEEKLY",
    ...overrides,
  };
}

describe("expandRecurringEvent", () => {
  it("expands a weekly rule to one occurrence per week within the range", () => {
    const result = expandRecurringEvent(
      weeklyMaster(),
      new Set(),
      new Date("2026-08-26T00:00:00"),
      new Date("2026-09-23T23:59:59"),
      HOST_TZ
    );
    expect(result.map((o) => dayKey(o.startAt, HOST_TZ))).toEqual([
      "2026-08-26",
      "2026-09-02",
      "2026-09-09",
      "2026-09-16",
      "2026-09-23",
    ]);
  });

  it("preserves the master's title, color, and duration on every occurrence", () => {
    const [occurrence] = expandRecurringEvent(
      weeklyMaster(),
      new Set(),
      new Date("2026-08-26T00:00:00"),
      new Date("2026-08-26T23:59:59"),
      HOST_TZ
    );
    expect(occurrence.title).toBe("Team Sync");
    expect(occurrence.calendarColor).toBe("#7a8a5e");
    expect(occurrence.endAt.getTime() - occurrence.startAt.getTime()).toBe(60 * 60 * 1000);
  });

  it("excludes the master's own start date when it's in the materialized set", () => {
    const materialized = new Set([dayKey(new Date("2026-08-26T10:00:00"), HOST_TZ)]);
    const result = expandRecurringEvent(
      weeklyMaster(),
      materialized,
      new Date("2026-08-26T00:00:00"),
      new Date("2026-09-02T23:59:59"),
      HOST_TZ
    );
    expect(result.map((o) => dayKey(o.startAt, HOST_TZ))).toEqual(["2026-09-02"]);
  });

  it("excludes any other already-materialized occurrence date", () => {
    const materialized = new Set([
      dayKey(new Date("2026-08-26T10:00:00"), HOST_TZ),
      dayKey(new Date("2026-09-09T10:00:00"), HOST_TZ),
    ]);
    const result = expandRecurringEvent(
      weeklyMaster(),
      materialized,
      new Date("2026-08-26T00:00:00"),
      new Date("2026-09-16T23:59:59"),
      HOST_TZ
    );
    expect(result.map((o) => dayKey(o.startAt, HOST_TZ))).toEqual(["2026-09-02", "2026-09-16"]);
  });

  it("expands a daily rule", () => {
    const result = expandRecurringEvent(
      weeklyMaster({ recurrence_rule: "FREQ=DAILY" }),
      new Set(),
      new Date("2026-08-26T00:00:00"),
      new Date("2026-08-29T23:59:59"),
      HOST_TZ
    );
    expect(result.map((o) => dayKey(o.startAt, HOST_TZ))).toEqual(["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29"]);
  });

  it("expands a monthly rule", () => {
    const result = expandRecurringEvent(
      weeklyMaster({ recurrence_rule: "FREQ=MONTHLY" }),
      new Set(),
      new Date("2026-08-26T00:00:00"),
      new Date("2026-11-26T23:59:59"),
      HOST_TZ
    );
    expect(result.map((o) => dayKey(o.startAt, HOST_TZ))).toEqual(["2026-08-26", "2026-09-26", "2026-10-26", "2026-11-26"]);
  });

  it("returns an empty array when the range has no occurrences", () => {
    const result = expandRecurringEvent(
      weeklyMaster(),
      new Set(),
      new Date("2026-01-01T00:00:00"),
      new Date("2026-01-07T23:59:59"),
      HOST_TZ
    );
    expect(result).toEqual([]);
  });
});
