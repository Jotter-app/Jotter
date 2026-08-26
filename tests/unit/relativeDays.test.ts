import { describe, expect, it } from "vitest";
import { formatRelativeDays } from "@/lib/dates/relativeDays";

const REF = new Date("2026-08-22T12:00:00");

describe("formatRelativeDays", () => {
  it("labels the same calendar day as Today, regardless of time of day", () => {
    expect(formatRelativeDays(new Date("2026-08-22T23:59:00"), REF)).toBe("Today");
    expect(formatRelativeDays(new Date("2026-08-22T00:01:00"), REF)).toBe("Today");
  });

  it("labels the next calendar day as Tomorrow", () => {
    expect(formatRelativeDays(new Date("2026-08-23T00:01:00"), REF)).toBe("Tomorrow");
  });

  it("labels the previous calendar day as Yesterday", () => {
    expect(formatRelativeDays(new Date("2026-08-21T23:59:00"), REF)).toBe("Yesterday");
  });

  it("counts forward multiple days", () => {
    expect(formatRelativeDays(new Date("2026-08-25T09:00:00"), REF)).toBe("In 3 days");
  });

  it("counts backward multiple days as overdue", () => {
    expect(formatRelativeDays(new Date("2026-08-19T09:00:00"), REF)).toBe("3 days ago");
  });
});
