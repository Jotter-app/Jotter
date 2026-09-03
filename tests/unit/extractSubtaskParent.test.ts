import { describe, expect, it } from "vitest";
import { extractSubtaskParent } from "@/lib/tasks/extractSubtaskParent";

describe("extractSubtaskParent", () => {
  it("returns the trimmed text unchanged and no parent when there's no marker", () => {
    expect(extractSubtaskParent("just a plain task")).toEqual({
      title: "just a plain task",
      parentTitle: null,
    });
  });

  it("extracts a single-word parent title from the end", () => {
    expect(extractSubtaskParent("pick up milk ^Groceries")).toEqual({
      title: "pick up milk",
      parentTitle: "Groceries",
    });
  });

  it("extracts a multi-word parent title from the end", () => {
    expect(extractSubtaskParent("pick up milk ^Buy Groceries This Week")).toEqual({
      title: "pick up milk",
      parentTitle: "Buy Groceries This Week",
    });
  });

  it("trims surrounding whitespace from the parent title", () => {
    expect(extractSubtaskParent("pick up milk ^  Groceries  ")).toEqual({
      title: "pick up milk",
      parentTitle: "Groceries",
    });
  });

  it("falls back to the original text with no parent when there's nothing before the marker", () => {
    expect(extractSubtaskParent("^Groceries")).toEqual({
      title: "^Groceries",
      parentTitle: null,
    });
  });

  it("falls back to the original text with no parent when there's nothing after the marker", () => {
    expect(extractSubtaskParent("pick up milk ^")).toEqual({
      title: "pick up milk ^",
      parentTitle: null,
    });
  });

  it("does not match a caret embedded mid-word", () => {
    expect(extractSubtaskParent("2^10 is 1024")).toEqual({
      title: "2^10 is 1024",
      parentTitle: null,
    });
  });
});
