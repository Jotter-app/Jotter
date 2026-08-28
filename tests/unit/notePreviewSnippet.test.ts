import { describe, expect, it } from "vitest";
import { notePreviewSnippet } from "@/lib/notes/notePreviewSnippet";

describe("notePreviewSnippet", () => {
  it("returns a placeholder for an empty body", () => {
    expect(notePreviewSnippet("")).toBe("No content yet.");
  });

  it("returns a placeholder for a whitespace-only body", () => {
    expect(notePreviewSnippet("   \n\n  ")).toBe("No content yet.");
  });

  it("returns short bodies unchanged, aside from whitespace collapsing", () => {
    expect(notePreviewSnippet("Hello world.")).toBe("Hello world.");
  });

  it("collapses newlines and repeated whitespace into single spaces", () => {
    expect(notePreviewSnippet("# Heading\n\n- item one\n- item two")).toBe("# Heading - item one - item two");
  });

  it("truncates bodies over the length cap and appends an ellipsis", () => {
    const long = "a".repeat(200);
    const result = notePreviewSnippet(long);
    expect(result).toBe(`${"a".repeat(150)}…`);
    expect(result.length).toBe(151);
  });

  it("respects a custom maxLength", () => {
    expect(notePreviewSnippet("abcdefghij", 5)).toBe("abcde…");
  });
});
