import { describe, expect, it } from "vitest";
import { parseImplicit } from "@/lib/jotter/parseImplicit";

// 2026-08-22 is a Saturday.
const REF = new Date("2026-08-22T09:00:00");

describe("parseImplicit", () => {
  it("routes a short phrase with no date to a task with no due date", () => {
    const result = parseImplicit("buy milk", REF);
    expect(result.route).toBe("task");
    expect(result.title).toBe("buy milk");
    expect(result.dueAt).toBeNull();
    expect(result.endAt).toBeNull();
  });

  it("routes a short phrase with a plain due date to a task with a due date", () => {
    const result = parseImplicit("call mom tomorrow 5pm", REF);
    expect(result.route).toBe("task");
    expect(result.title).toBe("call mom");
    expect(result.dueAt).not.toBeNull();
    expect(result.endAt).toBeNull();
  });

  it("routes a two-sided time range to an event", () => {
    const result = parseImplicit("team sync tomorrow 2-3pm", REF);
    expect(result.route).toBe("event");
    expect(result.title).toBe("team sync");
    expect(result.dueAt!.getHours()).toBe(14);
    expect(result.endAt!.getHours()).toBe(15);
  });

  it("routes a duration phrase after the date/time to an event, stripping the phrase from the title", () => {
    const result = parseImplicit("meeting tomorrow 2pm for 1 hour", REF);
    expect(result.route).toBe("event");
    expect(result.title).toBe("meeting");
    expect(result.dueAt!.getHours()).toBe(14);
    expect(result.endAt!.getHours()).toBe(15);
  });

  it("supports minute durations", () => {
    const result = parseImplicit("lunch tomorrow noon for 30 minutes", REF);
    expect(result.route).toBe("event");
    expect(result.endAt!.getTime() - result.dueAt!.getTime()).toBe(30 * 60_000);
  });

  it("never applies the duration heuristic when no date was found at all", () => {
    // No date/time signal anywhere in this phrase -- must not be
    // misread as a duration-only event.
    const result = parseImplicit("read for 20 pages", REF);
    expect(result.route).toBe("task");
    expect(result.dueAt).toBeNull();
    expect(result.endAt).toBeNull();
  });

  it("treats a bare 'for N minutes' as chrono's own casual relative-time reference, not a range", () => {
    // chrono-node itself resolves "for 5 minutes" to "5 minutes from the
    // reference time" as a standalone due point -- this is existing
    // parseQuickAdd behavior, not something the duration regex adds. The
    // regex only ever computes an *end* time on top of an already-found
    // start, so this stays a task (no second time to pair it with), not
    // an event.
    const result = parseImplicit("wait for 5 minutes", REF);
    expect(result.route).toBe("task");
    expect(result.dueAt).not.toBeNull();
    expect(result.endAt).toBeNull();
  });

  it("routes long input to a note, splitting the first line as the title", () => {
    const result = parseImplicit("Meeting notes\nDiscussed roadmap and next steps.", REF);
    expect(result.route).toBe("note");
    expect(result.title).toBe("Meeting notes");
    expect(result.noteBody).toBe("Discussed roadmap and next steps.");
  });

  it("routes a long single line (no newline) to a note", () => {
    const longLine = "This is a genuinely long single line of text that has no newline in it at all here";
    const result = parseImplicit(longLine, REF);
    expect(result.route).toBe("note");
    expect(result.noteBody).toBe(longLine);
  });

  it("prioritizes note-shaped length over an incidental date word inside long text", () => {
    const longText =
      "Project retrospective\nWe discussed what went well and what needs to change tomorrow onward, plus several other long-form notes about the roadmap.";
    const result = parseImplicit(longText, REF);
    expect(result.route).toBe("note");
  });

  it("strips #tags from a task title and returns them separately", () => {
    const result = parseImplicit("call mom tomorrow 5pm #family", REF);
    expect(result.route).toBe("task");
    expect(result.title).toBe("call mom");
    expect(result.tags).toEqual(["family"]);
  });

  it("keeps #tags visible in a note's body but still extracts them", () => {
    const result = parseImplicit("Grocery list\nmilk, eggs, bread #errands", REF);
    expect(result.route).toBe("note");
    expect(result.noteBody).toContain("#errands");
    expect(result.tags).toEqual(["errands"]);
  });
});
