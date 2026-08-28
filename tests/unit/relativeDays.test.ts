import { describe, expect, it } from "vitest";
import { formatRelativeDays } from "@/lib/dates/relativeDays";

// Matches whichever timezone actually parsed the naive (no offset/"Z")
// date strings below -- both the "date" and "REF" arguments come from the
// SAME runtime, so wrapping them in that SAME zone reproduces exactly what
// plain calendar-day comparison would already do, regardless of which host
// or CI machine happens to run this suite.
const HOST_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const REF = new Date("2026-08-22T12:00:00");

describe("formatRelativeDays", () => {
  it("labels the same calendar day as Today, regardless of time of day", () => {
    expect(formatRelativeDays(new Date("2026-08-22T23:59:00"), HOST_TZ, REF)).toBe("Today");
    expect(formatRelativeDays(new Date("2026-08-22T00:01:00"), HOST_TZ, REF)).toBe("Today");
  });

  it("labels the next calendar day as Tomorrow", () => {
    expect(formatRelativeDays(new Date("2026-08-23T00:01:00"), HOST_TZ, REF)).toBe("Tomorrow");
  });

  it("labels the previous calendar day as Yesterday", () => {
    expect(formatRelativeDays(new Date("2026-08-21T23:59:00"), HOST_TZ, REF)).toBe("Yesterday");
  });

  it("counts forward multiple days", () => {
    expect(formatRelativeDays(new Date("2026-08-25T09:00:00"), HOST_TZ, REF)).toBe("In 3 days");
  });

  it("counts backward multiple days as overdue", () => {
    expect(formatRelativeDays(new Date("2026-08-19T09:00:00"), HOST_TZ, REF)).toBe("3 days ago");
  });

  // Reproduces the SSR/hydration mismatch this timeZone parameter exists to
  // close off: a due date and a "now" that land on different calendar days
  // depending on which timezone classifies them. Both instants are fixed,
  // unambiguous UTC instants (the "Z" suffix), independent of the host
  // machine running this test -- only the explicit `timeZone` argument
  // determines the result, exactly as it should for a real request.
  describe("cross-timezone correctness (independent of host timezone)", () => {
    // "Now" is 2026-08-28T22:13:00Z -- still Aug 28 in both UTC and
    // America/Chicago (UTC-5 in August).
    const nowInstant = new Date("2026-08-28T22:13:00Z");
    // 2026-08-29T04:00:00Z is Aug 29 in UTC, but only 2026-08-28T23:00
    // in America/Chicago -- still "today" for a Chicago viewer.
    const straddlingInstant = new Date("2026-08-29T04:00:00Z");

    it("classifies a straddling instant as Tomorrow when evaluated in UTC", () => {
      expect(formatRelativeDays(straddlingInstant, "UTC", nowInstant)).toBe("Tomorrow");
    });

    it("classifies the exact same instant as Today when evaluated in the viewer's own zone", () => {
      expect(formatRelativeDays(straddlingInstant, "America/Chicago", nowInstant)).toBe("Today");
    });
  });
});
