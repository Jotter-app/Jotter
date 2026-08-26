import { describe, expect, it } from "vitest";
import { diffNoteLinks } from "@/lib/notes/syncNoteLinks";

describe("diffNoteLinks", () => {
  it("returns nothing to add or remove when both sides match", () => {
    expect(diffNoteLinks(["a", "b"], ["a", "b"])).toEqual({ toAdd: [], toRemove: [] });
  });

  it("adds ids that are desired but not yet linked", () => {
    expect(diffNoteLinks([], ["a", "b"])).toEqual({ toAdd: ["a", "b"], toRemove: [] });
  });

  it("removes ids that are linked but no longer desired", () => {
    expect(diffNoteLinks(["a", "b"], [])).toEqual({ toAdd: [], toRemove: ["a", "b"] });
  });

  it("handles a mix of additions and removals", () => {
    expect(diffNoteLinks(["a", "b"], ["b", "c"])).toEqual({ toAdd: ["c"], toRemove: ["a"] });
  });

  it("is a no-op for two empty lists", () => {
    expect(diffNoteLinks([], [])).toEqual({ toAdd: [], toRemove: [] });
  });

  it("ignores duplicate ids within either list", () => {
    expect(diffNoteLinks(["a", "a"], ["a", "b", "b"])).toEqual({ toAdd: ["b"], toRemove: [] });
  });
});
