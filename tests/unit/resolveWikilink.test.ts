import { describe, expect, it } from "vitest";
import { extractWikilinkTitles, resolveWikilinkTitle, type WikilinkCandidate } from "@/lib/notes/resolveWikilink";

describe("extractWikilinkTitles", () => {
  it("returns an empty array when there are no wikilinks", () => {
    expect(extractWikilinkTitles("Just some plain notes.")).toEqual([]);
  });

  it("extracts a single wikilink title", () => {
    expect(extractWikilinkTitles("See [[Project Plan]] for details.")).toEqual(["Project Plan"]);
  });

  it("extracts multiple distinct wikilinks", () => {
    expect(extractWikilinkTitles("Related: [[Alpha]] and [[Beta]]")).toEqual(["Alpha", "Beta"]);
  });

  it("dedupes repeated titles, keeping first-seen order", () => {
    expect(extractWikilinkTitles("[[Alpha]] again, later [[Beta]], then [[Alpha]] once more")).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("trims whitespace inside the brackets", () => {
    expect(extractWikilinkTitles("[[  Padded Title  ]]")).toEqual(["Padded Title"]);
  });

  it("never treats an unterminated '[[' as a link", () => {
    expect(extractWikilinkTitles("Typing [[ still going")).toEqual([]);
  });

  it("does not match across a closing bracket boundary", () => {
    expect(extractWikilinkTitles("[[a]] not [[b] broken [[c]]")).toEqual(["a", "c"]);
  });

  it("ignores an empty [[]]", () => {
    expect(extractWikilinkTitles("Nothing here: [[]]")).toEqual([]);
  });
});

describe("resolveWikilinkTitle", () => {
  const candidates: WikilinkCandidate[] = [
    { id: "1", title: "Project Plan", updated_at: "2026-01-01T00:00:00Z" },
    { id: "2", title: "Weekly Notes", updated_at: "2026-01-02T00:00:00Z" },
  ];

  it("resolves an exact title match", () => {
    expect(resolveWikilinkTitle("Project Plan", candidates)?.id).toBe("1");
  });

  it("resolves case-insensitively", () => {
    expect(resolveWikilinkTitle("project plan", candidates)?.id).toBe("1");
    expect(resolveWikilinkTitle("PROJECT PLAN", candidates)?.id).toBe("1");
  });

  it("returns null when no note has that title", () => {
    expect(resolveWikilinkTitle("Nonexistent", candidates)).toBeNull();
  });

  it("returns null for a blank title", () => {
    expect(resolveWikilinkTitle("   ", candidates)).toBeNull();
  });

  it("picks the most recently updated note when titles are duplicated", () => {
    const duplicates: WikilinkCandidate[] = [
      { id: "old", title: "Standup", updated_at: "2026-01-01T00:00:00Z" },
      { id: "new", title: "Standup", updated_at: "2026-06-01T00:00:00Z" },
    ];
    expect(resolveWikilinkTitle("Standup", duplicates)?.id).toBe("new");
  });
});
