import { describe, expect, it } from "vitest";
import { findTaskCommands } from "@/lib/jotter/parseNoteCommands";

// 2026-08-22 is a Saturday.
const REF = new Date("2026-08-22T09:00:00");

describe("findTaskCommands", () => {
  it("finds a single /task create line and reports its line index", () => {
    const body = "Meeting notes\n/task create \"call mom\" tomorrow 5pm #family\nMore notes below.";
    const commands = findTaskCommands(body, REF);

    expect(commands).toHaveLength(1);
    expect(commands[0].lineIndex).toBe(1);
    expect(commands[0].intent.route).toBe("task");
    expect(commands[0].intent.title).toBe("call mom");
    expect(commands[0].intent.tags).toEqual(["family"]);
  });

  it("finds multiple command lines in one body", () => {
    const body = [
      "/task create \"buy milk\" tomorrow 9am",
      "some prose in between",
      "/task create \"call mom\" tomorrow 5pm",
    ].join("\n");
    const commands = findTaskCommands(body, REF);

    expect(commands).toHaveLength(2);
    expect(commands[0].lineIndex).toBe(0);
    expect(commands[0].intent.title).toBe("buy milk");
    expect(commands[1].lineIndex).toBe(2);
    expect(commands[1].intent.title).toBe("call mom");
  });

  it("ignores ordinary prose, including text that just mentions /task", () => {
    const body = "This note is about how /task create works, not an actual command.";
    expect(findTaskCommands(body, REF)).toEqual([]);
  });

  it("ignores a malformed command (missing a date/time)", () => {
    const body = '/task create "no date here"';
    expect(findTaskCommands(body, REF)).toEqual([]);
  });

  it("ignores /event and /note command lines -- only /task is supported inline", () => {
    const body = ['/event create "team sync" tomorrow 2-3pm', '/note create "x" "y"'].join("\n");
    expect(findTaskCommands(body, REF)).toEqual([]);
  });

  it("tolerates leading/trailing whitespace on the command line", () => {
    const body = '   /task create "buy milk" tomorrow 9am   ';
    const commands = findTaskCommands(body, REF);
    expect(commands).toHaveLength(1);
    expect(commands[0].intent.title).toBe("buy milk");
  });
});
