import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "@/lib/dates/parseQuickAdd";

// Fixed reference so relative-date assertions are deterministic.
// 2026-08-22 is a Saturday.
const REF = new Date("2026-08-22T09:00:00");

describe("parseQuickAdd", () => {
  it("returns the full input as the title with no due date when nothing parses", () => {
    const result = parseQuickAdd("buy groceries", REF);
    expect(result).toEqual({ title: "buy groceries", dueAt: null, endAt: null });
  });

  it("never blocks on empty input", () => {
    const result = parseQuickAdd("   ", REF);
    expect(result.title).toBe("");
    expect(result.dueAt).toBeNull();
  });

  it("parses a relative day + time and strips it from the title", () => {
    const result = parseQuickAdd("call mom tomorrow 5pm", REF);
    expect(result.title).toBe("call mom");
    expect(result.dueAt).not.toBeNull();
    expect(result.dueAt!.getDate()).toBe(23);
    expect(result.dueAt!.getHours()).toBe(17);
  });

  it("parses a time-only expression relative to the reference date", () => {
    const result = parseQuickAdd("standup at 3pm", REF);
    expect(result.title).toBe("standup");
    expect(result.dueAt).not.toBeNull();
    expect(result.dueAt!.getHours()).toBe(15);
    expect(result.dueAt!.getDate()).toBe(REF.getDate());
  });

  it("does not leave a dangling preposition when chrono doesn't consume it", () => {
    const result = parseQuickAdd("team sync on monday", REF);
    expect(result.title).toBe("team sync");
    expect(result.dueAt).not.toBeNull();
  });

  it("handles an ambiguous/ordinary date without crashing and strips it from the title", () => {
    const result = parseQuickAdd("renew passport next friday", REF);
    expect(result.title).toBe("renew passport");
    expect(result.dueAt).not.toBeNull();
    expect(result.dueAt!.getDay()).toBe(5); // Friday
  });

  it("falls back to the raw text as title if the date match consumes the entire input", () => {
    const result = parseQuickAdd("tomorrow 5pm", REF);
    expect(result.title).toBe("tomorrow 5pm");
    expect(result.dueAt).not.toBeNull();
  });

  it("exposes endAt when chrono finds a two-sided time range", () => {
    const result = parseQuickAdd("team sync tomorrow 2-3pm", REF);
    expect(result.title).toBe("team sync");
    expect(result.dueAt).not.toBeNull();
    expect(result.endAt).not.toBeNull();
    expect(result.dueAt!.getHours()).toBe(14);
    expect(result.endAt!.getHours()).toBe(15);
  });

  it("leaves endAt null for a plain single due date/time", () => {
    const result = parseQuickAdd("call mom tomorrow 5pm", REF);
    expect(result.endAt).toBeNull();
  });

  describe("timeZone", () => {
    // 2026-08-29T02:30:00Z is already the 29th in UTC, but still the
    // evening of the 28th in America/Chicago (UTC-5 in August) -- the exact
    // mismatch that sent a "today at 9:55pm" task to the wrong day when a
    // Server Action (running in the server's own zone, UTC on Vercel)
    // resolved "today" against that zone instead of the viewer's.
    const REF_NEAR_MIDNIGHT_UTC = new Date("2026-08-29T02:30:00Z");

    it("resolves 'today' against the given IANA zone, not the process's own", () => {
      const result = parseQuickAdd("Be Awesome today at 9:55pm", REF_NEAR_MIDNIGHT_UTC, "America/Chicago");
      expect(result.title).toBe("Be Awesome");
      // 9:55pm on the 28th in America/Chicago (UTC-5) is 02:55 UTC on the 29th.
      expect(result.dueAt?.toISOString()).toBe("2026-08-29T02:55:00.000Z");
    });

    it("resolves the same phrase against a different zone to a different instant", () => {
      // Same reference instant and text, but a zone 19 hours further east --
      // proves the offset is actually driving the result, not being ignored.
      const result = parseQuickAdd("today at 9:55pm", REF_NEAR_MIDNIGHT_UTC, "Pacific/Kiritimati");
      expect(result.dueAt?.toISOString()).toBe("2026-08-29T07:55:00.000Z");
    });
  });
});
