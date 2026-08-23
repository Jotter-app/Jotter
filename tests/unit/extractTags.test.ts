import { describe, expect, it } from "vitest";
import { extractAndStripTags, extractTags } from "@/lib/markdown/extractTags";

describe("extractTags", () => {
  it("returns an empty array when there are no tags", () => {
    expect(extractTags("Just some plain notes.")).toEqual([]);
  });

  it("extracts a single hashtag", () => {
    expect(extractTags("Discussed scope with #team.")).toEqual(["team"]);
  });

  it("extracts multiple distinct tags", () => {
    expect(extractTags("#work and #personal items mixed together")).toEqual(["work", "personal"]);
  });

  it("dedupes repeated tags, keeping first-seen order", () => {
    expect(extractTags("#team meeting, then another #team sync, plus #urgent")).toEqual([
      "team",
      "urgent",
    ]);
  });

  it("lowercases tags so #Team and #team are the same tag", () => {
    expect(extractTags("#Team then #team")).toEqual(["team"]);
  });

  it("does not treat markdown headers as tags", () => {
    expect(extractTags("# Heading one\n## Heading two\n### Heading three")).toEqual([]);
  });

  it("handles a tag immediately followed by punctuation", () => {
    expect(extractTags("Ping #urgent, then #followup!")).toEqual(["urgent", "followup"]);
  });

  it("does not match a bare # with no following letter", () => {
    expect(extractTags("price is # 5 and also #123")).toEqual([]);
  });

  it("allows hyphens and underscores within a tag", () => {
    expect(extractTags("#follow-up and #q4_planning")).toEqual(["follow-up", "q4_planning"]);
  });
});

describe("extractAndStripTags", () => {
  it("strips comma-separated tags from the end of a quick-add title", () => {
    expect(extractAndStripTags("buy milk #errands, #shopping")).toEqual({
      title: "buy milk",
      tags: ["errands", "shopping"],
    });
  });

  it("strips space-separated tags with no commas", () => {
    expect(extractAndStripTags("finish report #work #urgent")).toEqual({
      title: "finish report",
      tags: ["work", "urgent"],
    });
  });

  it("strips tags from the middle of the title", () => {
    expect(extractAndStripTags("buy #errands milk")).toEqual({
      title: "buy milk",
      tags: ["errands"],
    });
  });

  it("strips leading tags", () => {
    expect(extractAndStripTags("#work, #urgent finish report")).toEqual({
      title: "finish report",
      tags: ["work", "urgent"],
    });
  });

  it("returns the trimmed text unchanged when there are no tags", () => {
    expect(extractAndStripTags("just a plain task")).toEqual({
      title: "just a plain task",
      tags: [],
    });
  });

  it("falls back to the original text if stripping would leave nothing", () => {
    expect(extractAndStripTags("#errands, #shopping")).toEqual({
      title: "#errands, #shopping",
      tags: ["errands", "shopping"],
    });
  });

  it("lowercases and dedupes tags the same way as extractTags", () => {
    expect(extractAndStripTags("call mom #Family, #family")).toEqual({
      title: "call mom",
      tags: ["family"],
    });
  });
});
