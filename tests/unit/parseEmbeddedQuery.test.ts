import { describe, expect, it } from "vitest";
import { parseEmbeddedQuery } from "@/lib/jotter/parseEmbeddedQuery";

describe("parseEmbeddedQuery", () => {
  it("returns null for an ordinary line of prose", () => {
    expect(parseEmbeddedQuery("Just a regular sentence.")).toBeNull();
  });

  it("returns null for a line that starts with a literal question mark but isn't a query", () => {
    expect(parseEmbeddedQuery("? maybe I should add this")).toBeNull();
    expect(parseEmbeddedQuery("?tasked something else")).toBeNull();
  });

  it("parses a bare ?tasks query", () => {
    expect(parseEmbeddedQuery("?tasks")).toEqual({ pillar: "task", tag: undefined, status: undefined, due: undefined });
  });

  it("parses a bare ?notes query", () => {
    expect(parseEmbeddedQuery("?notes")).toEqual({ pillar: "note", tag: undefined });
  });

  it("parses a tag filter on tasks", () => {
    expect(parseEmbeddedQuery("?tasks #client-x")).toMatchObject({ pillar: "task", tag: "client-x" });
  });

  it("lowercases the tag", () => {
    expect(parseEmbeddedQuery("?tasks #Client-X")).toMatchObject({ tag: "client-x" });
  });

  it("parses a status filter on tasks", () => {
    expect(parseEmbeddedQuery("?tasks status:open")).toMatchObject({ status: "open" });
    expect(parseEmbeddedQuery("?tasks status:done")).toMatchObject({ status: "done" });
  });

  it("parses a due filter on tasks", () => {
    expect(parseEmbeddedQuery("?tasks due:today")).toMatchObject({ due: "today" });
    expect(parseEmbeddedQuery("?tasks due:overdue")).toMatchObject({ due: "overdue" });
    expect(parseEmbeddedQuery("?tasks due:week")).toMatchObject({ due: "week" });
  });

  it("combines a tag, status, and due filter", () => {
    expect(parseEmbeddedQuery("?tasks #client-x status:open due:week")).toEqual({
      pillar: "task",
      tag: "client-x",
      status: "open",
      due: "week",
    });
  });

  it("drops an unrecognized status/due token instead of failing the whole line", () => {
    expect(parseEmbeddedQuery("?tasks status:blocked")).toMatchObject({ status: undefined });
    expect(parseEmbeddedQuery("?tasks due:tomorrow")).toMatchObject({ due: undefined });
  });

  it("ignores status/due tokens on a ?notes query", () => {
    expect(parseEmbeddedQuery("?notes #project-x status:open due:today")).toEqual({
      pillar: "note",
      tag: "project-x",
    });
  });

  it("parses a bare ?events query", () => {
    expect(parseEmbeddedQuery("?events")).toMatchObject({ pillar: "event", tag: undefined });
  });

  it("parses a tag and due filter on events", () => {
    expect(parseEmbeddedQuery("?events #standup due:today")).toMatchObject({
      pillar: "event",
      tag: "standup",
      due: "today",
    });
  });

  it("still parses status/due tokens on events even though runEmbeddedQuery only applies due:today to them", () => {
    expect(parseEmbeddedQuery("?events status:open due:week")).toMatchObject({
      pillar: "event",
      status: "open",
      due: "week",
    });
  });
});
