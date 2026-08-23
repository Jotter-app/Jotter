import { describe, expect, it } from "vitest";
import { parseExplicit } from "@/lib/jotter/parseExplicit";

// 2026-08-22 is a Saturday.
const REF = new Date("2026-08-22T09:00:00");

describe("parseExplicit", () => {
  it("rejects input that doesn't start with /", () => {
    const result = parseExplicit("task create x", REF);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects an unknown pillar", () => {
    const result = parseExplicit("/reminder create x", REF);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown pillar/i);
  });

  it("rejects an unsupported action", () => {
    const result = parseExplicit('/task edit "x"', REF);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/create/i);
  });

  it("is case-insensitive on pillar and action tokens", () => {
    const result = parseExplicit('/TASK Create "call mom" tomorrow 5pm', REF);
    expect(result.ok).toBe(true);
    expect(result.intent?.route).toBe("task");
  });

  it('parses /task create "title" date #tags with an explicit quoted title', () => {
    const result = parseExplicit('/task create "call mom" tomorrow 5pm #family', REF);
    expect(result.ok).toBe(true);
    expect(result.intent?.route).toBe("task");
    expect(result.intent?.title).toBe("call mom");
    expect(result.intent?.tags).toEqual(["family"]);
    expect(result.intent?.dueAt).not.toBeNull();
  });

  it("parses /task create with no quotes, falling through to the implicit parser", () => {
    const result = parseExplicit("/task create call mom tomorrow 5pm #family", REF);
    expect(result.ok).toBe(true);
    expect(result.intent?.route).toBe("task");
    expect(result.intent?.title).toBe("call mom");
    expect(result.intent?.tags).toEqual(["family"]);
  });

  it("rejects a task/event command with no date/time", () => {
    const result = parseExplicit('/task create "call mom"', REF);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/date\/time/i);
  });

  it("parses /event create with a native chrono range", () => {
    const result = parseExplicit('/event create "team sync" tomorrow 2-3pm', REF);
    expect(result.ok).toBe(true);
    expect(result.intent?.route).toBe("event");
    expect(result.intent?.title).toBe("team sync");
    expect(result.intent?.dueAt!.getHours()).toBe(14);
    expect(result.intent?.endAt!.getHours()).toBe(15);
  });

  it("parses /event create with a duration phrase after the date, keeping the quoted title intact", () => {
    const result = parseExplicit('/event create "team sync" tomorrow 2pm for 1 hour', REF);
    expect(result.ok).toBe(true);
    expect(result.intent?.route).toBe("event");
    expect(result.intent?.title).toBe("team sync");
    expect(result.intent?.endAt!.getTime()).toBe(result.intent!.dueAt!.getTime() + 3_600_000);
  });

  it('parses /note create "title" "content", extracting tags from the content without stripping them', () => {
    const result = parseExplicit('/note create "Grocery list" "milk, eggs, bread #errands"', REF);
    expect(result.ok).toBe(true);
    expect(result.intent?.route).toBe("note");
    expect(result.intent?.title).toBe("Grocery list");
    expect(result.intent?.noteBody).toContain("#errands");
    expect(result.intent?.tags).toEqual(["errands"]);
  });

  it("rejects a note command with fewer than two quoted segments", () => {
    const result = parseExplicit('/note create "Grocery list"', REF);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/title and content/i);
  });
});
