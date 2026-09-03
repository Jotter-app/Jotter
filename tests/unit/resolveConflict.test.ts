import { describe, expect, it } from "vitest";
import { resolveConflict } from "@/lib/calendar-sync/resolveConflict";

describe("resolveConflict", () => {
  it("applies Google's data when Google was edited more recently", () => {
    expect(resolveConflict("2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z")).toBe("apply-google");
  });

  it("re-pushes local data when the local edit is more recent (a prior push must have failed)", () => {
    expect(resolveConflict("2026-09-01T11:00:00Z", "2026-09-01T10:00:00Z")).toBe("repush-local");
  });

  it("re-pushes (does not overwrite) when timestamps are equal", () => {
    expect(resolveConflict("2026-09-01T10:00:00Z", "2026-09-01T10:00:00Z")).toBe("repush-local");
  });
});
