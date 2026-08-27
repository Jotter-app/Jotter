import { describe, expect, it } from "vitest";
import { parseNoteFile, serializeNoteFrontmatter } from "@/lib/notes/noteFrontmatter";

describe("serializeNoteFrontmatter / parseNoteFile round-trip", () => {
  it("round-trips title, tags, dates, and body exactly", () => {
    const serialized = serializeNoteFrontmatter(
      { title: "Meeting Notes", tags: ["work", "urgent"], createdAt: "2026-08-20T10:00:00.000Z", updatedAt: "2026-08-26T09:00:00.000Z" },
      "Line one.\nLine two."
    );

    const { frontmatter, body } = parseNoteFile(serialized, "fallback");

    expect(frontmatter).toEqual({
      title: "Meeting Notes",
      tags: ["work", "urgent"],
      createdAt: "2026-08-20T10:00:00.000Z",
      updatedAt: "2026-08-26T09:00:00.000Z",
    });
    expect(body).toBe("Line one.\nLine two.");
  });

  it("round-trips an empty tag list", () => {
    const serialized = serializeNoteFrontmatter(
      { title: "No Tags", tags: [], createdAt: "2026-08-20T10:00:00.000Z", updatedAt: "2026-08-20T10:00:00.000Z" },
      "Body."
    );
    expect(parseNoteFile(serialized, "fallback").frontmatter.tags).toEqual([]);
  });

  it("round-trips a title containing a double quote and a colon", () => {
    const serialized = serializeNoteFrontmatter(
      { title: 'Say "hi": a story', tags: [], createdAt: "2026-08-20T10:00:00.000Z", updatedAt: "2026-08-20T10:00:00.000Z" },
      "Body."
    );
    expect(parseNoteFile(serialized, "fallback").frontmatter.title).toBe('Say "hi": a story');
  });

  it("round-trips an empty body", () => {
    const serialized = serializeNoteFrontmatter(
      { title: "Empty", tags: [], createdAt: "2026-08-20T10:00:00.000Z", updatedAt: "2026-08-20T10:00:00.000Z" },
      ""
    );
    expect(parseNoteFile(serialized, "fallback").body).toBe("");
  });
});

describe("parseNoteFile fallback behavior", () => {
  it("treats a file with no frontmatter block as pure body", () => {
    const { frontmatter, body } = parseNoteFile("Just plain markdown.\nNo frontmatter here.", "My Title");

    expect(frontmatter).toEqual({ title: null, tags: [], createdAt: null, updatedAt: null });
    expect(body).toBe("Just plain markdown.\nNo frontmatter here.");
  });

  it("treats an unterminated frontmatter block (no closing ---) as pure body", () => {
    const content = '---\ntitle: "Oops"\nNo closing marker below.';
    const { frontmatter, body } = parseNoteFile(content, "fallback");

    expect(frontmatter.title).toBeNull();
    expect(body).toBe(content);
  });

  it("falls back to the given title when frontmatter has an empty title value", () => {
    const content = '---\ntitle: ""\n---\n\nBody.';
    const { frontmatter } = parseNoteFile(content, "Fallback Title");
    expect(frontmatter.title).toBe("Fallback Title");
  });

  it("ignores unrecognized frontmatter keys without erroring", () => {
    const content = '---\ntitle: "Has Extra"\nauthor: "Someone"\n---\n\nBody.';
    const { frontmatter, body } = parseNoteFile(content, "fallback");

    expect(frontmatter.title).toBe("Has Extra");
    expect(body).toBe("Body.");
  });

  it("handles an empty file", () => {
    const { frontmatter, body } = parseNoteFile("", "fallback");
    expect(frontmatter).toEqual({ title: null, tags: [], createdAt: null, updatedAt: null });
    expect(body).toBe("");
  });
});
