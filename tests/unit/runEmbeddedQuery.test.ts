import { describe, expect, it } from "vitest";
import { runEmbeddedQuery, type QueryableNote, type QueryableTask } from "@/lib/jotter/runEmbeddedQuery";

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
});
