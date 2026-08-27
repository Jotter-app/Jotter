import { describe, expect, it } from "vitest";
import { sanitizeFilename, uniqueFilename } from "@/lib/notes/exportFilename";

describe("sanitizeFilename", () => {
  it("leaves an already-safe title untouched", () => {
    expect(sanitizeFilename("Meeting Notes")).toBe("Meeting Notes");
  });

  it("replaces characters invalid in a filename with a dash", () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(sanitizeFilename("too    many   spaces")).toBe("too many spaces");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeFilename("  padded  ")).toBe("padded");
  });

  it("falls back to Untitled when nothing valid remains", () => {
    expect(sanitizeFilename("///")).toBe("Untitled");
    expect(sanitizeFilename("   ")).toBe("Untitled");
    expect(sanitizeFilename("")).toBe("Untitled");
  });
});

describe("uniqueFilename", () => {
  it("returns the plain name when there's no collision", () => {
    const used = new Set<string>();
    expect(uniqueFilename("Note", used)).toBe("Note.md");
  });

  it("suffixes with -2, -3, ... on repeated collisions", () => {
    const used = new Set<string>();
    expect(uniqueFilename("Note", used)).toBe("Note.md");
    expect(uniqueFilename("Note", used)).toBe("Note-2.md");
    expect(uniqueFilename("Note", used)).toBe("Note-3.md");
  });

  it("tracks distinct base names independently", () => {
    const used = new Set<string>();
    expect(uniqueFilename("Alpha", used)).toBe("Alpha.md");
    expect(uniqueFilename("Beta", used)).toBe("Beta.md");
    expect(uniqueFilename("Alpha", used)).toBe("Alpha-2.md");
  });

  it("mutates the provided set so a caller can reuse it across an export pass", () => {
    const used = new Set<string>();
    uniqueFilename("Note", used);
    expect(used.has("Note.md")).toBe(true);
  });
});
