import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "@/lib/dates/parseQuickAdd";

// Fixed reference so relative-date assertions are deterministic.
// 2026-08-22 is a Saturday.
const REF = new Date("2026-08-22T09:00:00");

describe("parseQuickAdd", () => {
  it("returns the full input as the title with no due date when nothing parses", () => {
    const result = parseQuickAdd("buy groceries", REF);
    expect(result).toEqual({ title: "buy groceries", dueAt: null });
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
});
