import { describe, expect, it } from "vitest";
import { filterNoteOnlyTags } from "@/lib/tags/filterNoteOnlyTags";

describe("filterNoteOnlyTags", () => {
  const workTag = { id: "work" };
  const groceriesTag = { id: "groceries" };
  const journalTag = { id: "journal" };
  const allTags = [workTag, groceriesTag, journalTag];

  it("returns every tag unchanged when the setting is off", () => {
    expect(filterNoteOnlyTags(allTags, [{ tag_id: "work" }], false)).toEqual(allTags);
  });

  it("drops tags with zero task attachments when the setting is on", () => {
    const result = filterNoteOnlyTags(allTags, [{ tag_id: "work" }], true);
    expect(result).toEqual([workTag]);
  });

  it("keeps a tag attached to a task even if it's also attached to notes", () => {
    const result = filterNoteOnlyTags(allTags, [{ tag_id: "work" }, { tag_id: "groceries" }], true);
    expect(result).toEqual([workTag, groceriesTag]);
  });

  it("returns an empty list when no tags have any task attachment", () => {
    expect(filterNoteOnlyTags(allTags, [], true)).toEqual([]);
  });

  it("returns an empty list unchanged regardless of the setting", () => {
    expect(filterNoteOnlyTags([], [], true)).toEqual([]);
    expect(filterNoteOnlyTags([], [], false)).toEqual([]);
  });
});
