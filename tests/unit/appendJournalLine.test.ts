import { describe, expect, it } from "vitest";
import { appendJournalLine } from "@/lib/notes/appendJournalLine";

describe("appendJournalLine", () => {
  it("appends to an empty body with no leading blank lines", () => {
    expect(appendJournalLine("", "- Completed \"Buy milk\" — Aug 28, 2026")).toBe(
      "- Completed \"Buy milk\" — Aug 28, 2026"
    );
  });

  it("appends after a blank-line separator when the body has content", () => {
    expect(appendJournalLine("# Meeting notes\n\nSome content.", "- Completed \"Follow up\" — Aug 28, 2026")).toBe(
      "# Meeting notes\n\nSome content.\n\n- Completed \"Follow up\" — Aug 28, 2026"
    );
  });

  it("trims trailing whitespace from the existing body before appending", () => {
    expect(appendJournalLine("Some content.\n\n\n   ", "- Completed \"X\" — Aug 28, 2026")).toBe(
      "Some content.\n\n- Completed \"X\" — Aug 28, 2026"
    );
  });

  it("treats a whitespace-only body the same as an empty one", () => {
    expect(appendJournalLine("   \n  ", "- Completed \"X\" — Aug 28, 2026")).toBe(
      "- Completed \"X\" — Aug 28, 2026"
    );
  });
});
