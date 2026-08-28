import { describe, expect, it } from "vitest";
import { localDatetimeInputToUtcIso } from "@/lib/dates/localDatetimeInputToUtcIso";

// Expectations are built via the local-components Date constructor rather
// than a hardcoded UTC offset -- both it and localDatetimeInputToUtcIso
// interpret their input in whatever timezone the runtime is in, so this
// test passes identically no matter which timezone it happens to run
// under, the same way the real bug (server TZ != browser TZ) only shows
// up when the two SIDES of a conversion disagree on which timezone to use.
describe("localDatetimeInputToUtcIso", () => {
  it("converts a datetime-local value to the equivalent UTC instant", () => {
    const result = localDatetimeInputToUtcIso("2026-08-28T20:00");
    const expected = new Date(2026, 7, 28, 20, 0, 0, 0).toISOString();
    expect(result).toBe(expected);
  });

  it("preserves minute precision", () => {
    const result = localDatetimeInputToUtcIso("2026-01-01T00:05");
    const expected = new Date(2026, 0, 1, 0, 5, 0, 0).toISOString();
    expect(result).toBe(expected);
  });

  it("preserves seconds when present", () => {
    const result = localDatetimeInputToUtcIso("2026-06-15T12:30:45");
    const expected = new Date(2026, 5, 15, 12, 30, 45, 0).toISOString();
    expect(result).toBe(expected);
  });

  it("returns null for an empty string", () => {
    expect(localDatetimeInputToUtcIso("")).toBeNull();
  });

  it("returns null for an invalid string", () => {
    expect(localDatetimeInputToUtcIso("not-a-date")).toBeNull();
  });
});
