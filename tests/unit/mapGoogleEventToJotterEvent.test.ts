import { describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import { mapGoogleEventToJotterEvent, type RawGoogleEvent } from "@/lib/calendar-sync/googleClient";

const HOST_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe("mapGoogleEventToJotterEvent", () => {
  it("maps a timed event's dateTime fields directly", () => {
    const raw: RawGoogleEvent = {
      id: "abc123",
      status: "confirmed",
      summary: "Team Sync",
      updated: "2026-09-01T10:00:00.000Z",
      start: { dateTime: "2026-09-02T10:00:00-04:00" },
      end: { dateTime: "2026-09-02T11:00:00-04:00" },
    };

    const mapped = mapGoogleEventToJotterEvent(raw, HOST_TZ);

    expect(mapped.title).toBe("Team Sync");
    expect(mapped.cancelled).toBe(false);
    expect(mapped.updatedAt).toBe("2026-09-01T10:00:00.000Z");
    expect(new Date(mapped.startAt).toISOString()).toBe(new Date("2026-09-02T10:00:00-04:00").toISOString());
    expect(new Date(mapped.endAt).toISOString()).toBe(new Date("2026-09-02T11:00:00-04:00").toISOString());
  });

  it("maps an all-day event's date-only field to midnight in the given timezone", () => {
    const raw: RawGoogleEvent = {
      id: "allday1",
      status: "confirmed",
      summary: "Company Holiday",
      updated: "2026-09-01T10:00:00.000Z",
      start: { date: "2026-09-15" },
      end: { date: "2026-09-16" },
    };

    const mapped = mapGoogleEventToJotterEvent(raw, "America/New_York");

    // Compared by instant (getTime), not string equality -- TZDate's own
    // toISOString() renders with the zone's offset (e.g. "-04:00") rather
    // than normalizing to "Z" the way Date's toISOString() does, so the two
    // representations of the same instant don't string-compare equal even
    // when they are equal.
    expect(new Date(mapped.startAt).getTime()).toBe(new TZDate(2026, 8, 15, "America/New_York").getTime());
    expect(new Date(mapped.endAt).getTime()).toBe(new TZDate(2026, 8, 16, "America/New_York").getTime());
  });

  it("marks a cancelled event", () => {
    const raw: RawGoogleEvent = {
      id: "cancelled1",
      status: "cancelled",
      updated: "2026-09-01T10:00:00.000Z",
    };

    expect(mapGoogleEventToJotterEvent(raw, HOST_TZ).cancelled).toBe(true);
  });

  it("falls back to a placeholder title when summary is missing", () => {
    const raw: RawGoogleEvent = {
      id: "notitle1",
      status: "confirmed",
      updated: "2026-09-01T10:00:00.000Z",
      start: { dateTime: "2026-09-02T10:00:00Z" },
      end: { dateTime: "2026-09-02T11:00:00Z" },
    };

    expect(mapGoogleEventToJotterEvent(raw, HOST_TZ).title).toBe("(no title)");
  });
});
