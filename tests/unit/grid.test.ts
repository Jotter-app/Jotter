import { describe, expect, it } from "vitest";
import { buildMonthGrid, buildWeek, dayKey } from "@/lib/calendar/grid";

describe("dayKey", () => {
  it("keys an instant by its calendar day in the given timezone", () => {
    expect(dayKey(new Date("2026-08-29T12:00:00Z"), "UTC")).toBe("2026-08-29");
  });

  // Reproduces the bug this timeZone parameter exists to close off: reading
  // an instant's calendar day via whichever timezone happens to execute the
  // code (the previous, ambient-only behavior) instead of an explicit,
  // request-scoped zone. Both instants below are fixed, unambiguous UTC
  // instants, independent of the host machine running this test -- only the
  // explicit `timeZone` argument determines the result.
  it("classifies the same instant into different calendar days depending on timezone", () => {
    // 2026-08-29T02:00:00Z is Aug 29 in UTC, but still Aug 28, 9pm in
    // America/Chicago (UTC-5 in August).
    const straddlingInstant = new Date("2026-08-29T02:00:00Z");
    expect(dayKey(straddlingInstant, "UTC")).toBe("2026-08-29");
    expect(dayKey(straddlingInstant, "America/Chicago")).toBe("2026-08-28");
  });
});

describe("buildMonthGrid", () => {
  // This is the deeper bug flagged separately from the day-classification
  // fix: near a month boundary, the *entire* month grid -- not just one
  // cell's label -- can differ depending on which timezone builds it, since
  // startOfMonth/startOfWeek/eachDayOfInterval all read and construct dates
  // via whichever timezone is passed in. A server (UTC) and a viewer several
  // hours west of UTC can end up looking at literally different months for
  // the same "now".
  it("resolves to the correct month independently for each explicit timezone, for the same instant", () => {
    // 2026-09-01T02:00:00Z is September 1st in UTC, but still August 31st,
    // 9pm in America/Chicago.
    const anchorInstant = new Date("2026-09-01T02:00:00Z");

    const utcGrid = buildMonthGrid(anchorInstant, "UTC");
    const chicagoGrid = buildMonthGrid(anchorInstant, "America/Chicago");

    const utcKeys = utcGrid.flat().map((d) => dayKey(d, "UTC"));
    const chicagoKeys = chicagoGrid.flat().map((d) => dayKey(d, "America/Chicago"));

    // UTC sees September's grid...
    expect(utcKeys[0]).toBe("2026-08-30");
    expect(utcKeys[utcKeys.length - 1]).toBe("2026-10-03");
    // ...while Chicago, for the exact same instant, correctly still sees
    // August's grid -- each zone is internally consistent and correct for
    // itself, which is what makes this safe to call identically on the
    // server and in the browser as long as both are given the same
    // explicit `timeZone` (see useTimeZone).
    expect(chicagoKeys[0]).toBe("2026-07-26");
    expect(chicagoKeys[chicagoKeys.length - 1]).toBe("2026-09-05");
  });

  it("produces full Sun-Sat weeks", () => {
    const grid = buildMonthGrid(new Date("2026-08-15T12:00:00Z"), "UTC");
    for (const week of grid) {
      expect(week).toHaveLength(7);
    }
  });
});

describe("buildWeek", () => {
  it("returns the Sun-Sat week containing the given date, in the given timezone", () => {
    const days = buildWeek(new Date("2026-08-26T12:00:00Z"), "UTC");
    expect(days.map((d) => dayKey(d, "UTC"))).toEqual([
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });
});
