import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "@/lib/dates/formatInTimeZone";

describe("formatInTimeZone", () => {
  // The same absolute instant renders as a different wall-clock time (and
  // sometimes a different calendar day) depending on which zone formats
  // it -- this is exactly what date-fns's own `format` gets wrong when the
  // executing runtime's local zone isn't the viewer's (e.g. during SSR on
  // a UTC server), which is the root cause behind the reported hydration
  // mismatch.
  const instant = "2026-08-29T04:00:00Z";

  it("renders the wall-clock time in UTC", () => {
    expect(formatInTimeZone(instant, "UTC", "MMM d, h:mm a")).toBe("Aug 29, 4:00 AM");
  });

  it("renders the same instant's wall-clock time in the target zone, including a shifted calendar day", () => {
    expect(formatInTimeZone(instant, "America/Chicago", "MMM d, h:mm a")).toBe("Aug 28, 11:00 PM");
  });

  it("accepts a Date object as well as a string", () => {
    expect(formatInTimeZone(new Date(instant), "America/Chicago", "MMM d, h:mm a")).toBe("Aug 28, 11:00 PM");
  });
});
