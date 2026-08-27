import { describe, expect, it } from "vitest";
import { groupTasksByDueDate } from "@/lib/tasks/groupTasksByDueDate";

interface Task {
  id: string;
  due_at: string | null;
}

function task(id: string, due_at: string | null): Task {
  return { id, due_at };
}

function ids(tasks: Task[]): string[] {
  return tasks.map((t) => t.id);
}

describe("groupTasksByDueDate", () => {
  // Wednesday. This week runs Sun Aug 23 - Sat Aug 29; next week Aug 30 -
  // Sep 5; the month ends Aug 31 -- before next week does, so this
  // reference date exercises the "next week spills past month-end"
  // scenario on its own.
  const REF = new Date("2026-08-26T12:00:00");

  it("buckets overdue, today, this week (including its boundary), and next week", () => {
    const tasks = [
      task("overdue", "2026-08-25T09:00:00"),
      task("today", "2026-08-26T18:00:00"),
      task("tomorrow", "2026-08-27T09:00:00"),
      task("end-of-this-week", "2026-08-29T23:59:00"),
      task("start-of-next-week", "2026-08-30T00:01:00"),
      task("end-of-next-week", "2026-09-05T23:59:00"),
    ];

    const result = groupTasksByDueDate(tasks, REF);

    expect(ids(result.overdue)).toEqual(["overdue"]);
    expect(ids(result.today)).toEqual(["today"]);
    expect(ids(result.thisWeek)).toEqual(["tomorrow", "end-of-this-week"]);
    expect(ids(result.nextWeek)).toEqual(["start-of-next-week", "end-of-next-week"]);
  });

  it("leaves This Month empty and counts as later when next week already spans past month-end", () => {
    const tasks = [
      task("still-next-week", "2026-08-31T12:00:00"), // <= next week's end (Sep 5)
      task("later", "2026-09-06T12:00:00"), // just past next week's end
    ];

    const result = groupTasksByDueDate(tasks, REF);

    expect(ids(result.nextWeek)).toEqual(["still-next-week"]);
    expect(result.thisMonth).toEqual([]);
    expect(result.laterCount).toBe(1);
  });

  it("fills This Month when next week ends well before month-end", () => {
    // Monday. This week: Sun Aug 2 - Sat Aug 8. Next week: Aug 9 - Aug 15.
    // Month ends Aug 31, well after next week -- This Month has real room.
    const ref = new Date("2026-08-03T12:00:00");
    const tasks = [
      task("in-this-month", "2026-08-20T12:00:00"),
      task("end-of-month", "2026-08-31T23:59:00"),
      task("later", "2026-09-01T00:01:00"),
    ];

    const result = groupTasksByDueDate(tasks, ref);

    expect(ids(result.thisMonth)).toEqual(["in-this-month", "end-of-month"]);
    expect(result.laterCount).toBe(1);
  });

  it("handles a reference date near year-end without leaking into next month early", () => {
    // Monday. This week runs into January (Sun Dec 27 - Sat Jan 2), which
    // already exceeds December's own month-end -- This Month and Next Week
    // both end up empty, same spillover behavior as the August case above,
    // just crossing a year boundary.
    const ref = new Date("2026-12-28T12:00:00");
    const tasks = [
      task("end-of-december", "2026-12-31T23:59:00"), // within this week (ends Jan 2)
      task("early-january", "2027-01-05T12:00:00"), // within next week (ends Jan 9)
      task("mid-january", "2027-01-15T12:00:00"), // past next week
    ];

    const result = groupTasksByDueDate(tasks, ref);

    expect(ids(result.thisWeek)).toContain("end-of-december");
    expect(ids(result.nextWeek)).toEqual(["early-january"]);
    expect(result.thisMonth).toEqual([]);
    expect(result.laterCount).toBe(1);
  });

  it("puts tasks with no due date in their own bucket, untouched by date math", () => {
    const tasks = [task("no-date-a", null), task("no-date-b", null)];

    const result = groupTasksByDueDate(tasks, REF);

    expect(ids(result.noDueDate)).toEqual(["no-date-a", "no-date-b"]);
    expect(result.overdue).toEqual([]);
    expect(result.laterCount).toBe(0);
  });

  it("returns all-empty groups for an empty task list", () => {
    const result = groupTasksByDueDate([], REF);

    expect(result).toEqual({
      overdue: [],
      today: [],
      thisWeek: [],
      nextWeek: [],
      thisMonth: [],
      laterCount: 0,
      noDueDate: [],
    });
  });
});
