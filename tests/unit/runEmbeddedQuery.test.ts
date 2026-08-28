import { describe, expect, it } from "vitest";
import { runEmbeddedQuery, type QueryableEvent, type QueryableNote, type QueryableTask } from "@/lib/jotter/runEmbeddedQuery";

// Wednesday. This week runs Sun Aug 23 - Sat Aug 29; next week Aug 30 - Sep
// 5 -- same reference date groupTasksByDueDate.test.ts already validated
// these boundaries against.
const REF = new Date("2026-08-26T12:00:00");

function task(overrides: Partial<QueryableTask> & { id: string }): QueryableTask {
  return { title: overrides.id, completed_at: null, due_at: null, tags: [], ...overrides };
}

function note(overrides: Partial<QueryableNote> & { id: string }): QueryableNote {
  return { title: overrides.id, tags: [], ...overrides };
}

function event(overrides: Partial<QueryableEvent> & { id: string }): QueryableEvent {
  return { title: overrides.id, start_at: "2026-08-26T12:00:00", tags: [], ...overrides };
}

describe("runEmbeddedQuery", () => {
  it("returns all tasks when there's no filter", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    const result = runEmbeddedQuery({ pillar: "task" }, { tasks, notes: [] });
    expect(result.items).toEqual(tasks);
    expect(result.totalCount).toBe(2);
  });

  it("filters tasks by tag", () => {
    const tasks = [task({ id: "a", tags: ["client-x"] }), task({ id: "b", tags: ["client-y"] })];
    const result = runEmbeddedQuery({ pillar: "task", tag: "client-x" }, { tasks, notes: [] });
    expect(result.items.map((t) => t.id)).toEqual(["a"]);
  });

  it("filters tasks by status:open", () => {
    const tasks = [task({ id: "a", completed_at: null }), task({ id: "b", completed_at: "2026-08-20T00:00:00Z" })];
    const result = runEmbeddedQuery({ pillar: "task", status: "open" }, { tasks, notes: [] });
    expect(result.items.map((t) => t.id)).toEqual(["a"]);
  });

  it("filters tasks by status:done", () => {
    const tasks = [task({ id: "a", completed_at: null }), task({ id: "b", completed_at: "2026-08-20T00:00:00Z" })];
    const result = runEmbeddedQuery({ pillar: "task", status: "done" }, { tasks, notes: [] });
    expect(result.items.map((t) => t.id)).toEqual(["b"]);
  });

  it("filters tasks by due:overdue", () => {
    const tasks = [
      task({ id: "overdue", due_at: "2026-08-25T09:00:00" }),
      task({ id: "today", due_at: "2026-08-26T09:00:00" }),
      task({ id: "none", due_at: null }),
    ];
    const result = runEmbeddedQuery({ pillar: "task", due: "overdue" }, { tasks, notes: [] }, REF);
    expect(result.items.map((t) => t.id)).toEqual(["overdue"]);
  });

  it("filters tasks by due:today", () => {
    const tasks = [
      task({ id: "overdue", due_at: "2026-08-25T09:00:00" }),
      task({ id: "today", due_at: "2026-08-26T18:00:00" }),
      task({ id: "nextweek", due_at: "2026-08-30T09:00:00" }),
    ];
    const result = runEmbeddedQuery({ pillar: "task", due: "today" }, { tasks, notes: [] }, REF);
    expect(result.items.map((t) => t.id)).toEqual(["today"]);
  });

  it("filters tasks by due:week as today plus the rest of this week", () => {
    const tasks = [
      task({ id: "today", due_at: "2026-08-26T18:00:00" }),
      task({ id: "laterthisweek", due_at: "2026-08-27T09:00:00" }),
      task({ id: "nextweek", due_at: "2026-08-30T09:00:00" }),
    ];
    const result = runEmbeddedQuery({ pillar: "task", due: "week" }, { tasks, notes: [] }, REF);
    expect(result.items.map((t) => t.id).sort()).toEqual(["laterthisweek", "today"]);
  });

  it("truncates task results at 10 and reports the real total", () => {
    const tasks = Array.from({ length: 15 }, (_, i) => task({ id: `t${i}` }));
    const result = runEmbeddedQuery({ pillar: "task" }, { tasks, notes: [] });
    expect(result.items).toHaveLength(10);
    expect(result.totalCount).toBe(15);
  });

  it("returns all notes when there's no filter", () => {
    const notes = [note({ id: "a" }), note({ id: "b" })];
    const result = runEmbeddedQuery({ pillar: "note" }, { tasks: [], notes });
    expect(result.items).toEqual(notes);
  });

  it("filters notes by tag", () => {
    const notes = [note({ id: "a", tags: ["project-x"] }), note({ id: "b", tags: [] })];
    const result = runEmbeddedQuery({ pillar: "note", tag: "project-x" }, { tasks: [], notes });
    expect(result.items.map((n) => n.id)).toEqual(["a"]);
  });

  it("truncates note results at 10 and reports the real total", () => {
    const notes = Array.from({ length: 12 }, (_, i) => note({ id: `n${i}` }));
    const result = runEmbeddedQuery({ pillar: "note" }, { tasks: [], notes });
    expect(result.items).toHaveLength(10);
    expect(result.totalCount).toBe(12);
  });

  it("returns all events when there's no filter", () => {
    const events = [event({ id: "a" }), event({ id: "b" })];
    const result = runEmbeddedQuery({ pillar: "event" }, { tasks: [], notes: [], events });
    expect(result.items).toEqual(events);
  });

  it("treats a missing events snapshot as empty rather than throwing", () => {
    const result = runEmbeddedQuery({ pillar: "event" }, { tasks: [], notes: [] });
    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it("filters events by tag", () => {
    const events = [event({ id: "a", tags: ["standup"] }), event({ id: "b", tags: [] })];
    const result = runEmbeddedQuery({ pillar: "event", tag: "standup" }, { tasks: [], notes: [], events });
    expect(result.items.map((e) => e.id)).toEqual(["a"]);
  });

  it("filters events by due:today to just today's calendar day", () => {
    const events = [
      event({ id: "today-morning", start_at: "2026-08-26T09:00:00" }),
      event({ id: "today-evening", start_at: "2026-08-26T23:30:00" }),
      event({ id: "yesterday", start_at: "2026-08-25T23:59:00" }),
      event({ id: "tomorrow", start_at: "2026-08-27T00:01:00" }),
    ];
    const result = runEmbeddedQuery({ pillar: "event", due: "today" }, { tasks: [], notes: [], events }, REF);
    expect(result.items.map((e) => e.id).sort()).toEqual(["today-evening", "today-morning"]);
  });

  it("ignores status and non-today due values on events", () => {
    const events = [event({ id: "a" })];
    const result = runEmbeddedQuery(
      { pillar: "event", status: "done", due: "overdue" },
      { tasks: [], notes: [], events },
      REF
    );
    expect(result.items.map((e) => e.id)).toEqual(["a"]);
  });

  it("truncates event results at 10 and reports the real total", () => {
    const events = Array.from({ length: 11 }, (_, i) => event({ id: `e${i}` }));
    const result = runEmbeddedQuery({ pillar: "event" }, { tasks: [], notes: [], events });
    expect(result.items).toHaveLength(10);
    expect(result.totalCount).toBe(11);
  });
});
