import { describe, expect, it } from "vitest";
import { matchLineEmbed } from "@/lib/markdown/lineEmbeds";

describe("matchLineEmbed", () => {
  const VIDEO_ID = "dQw4w9WgXcQ";

  it("matches a standard watch URL", () => {
    expect(matchLineEmbed(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toEqual({
      type: "youtube",
      videoId: VIDEO_ID,
    });
  });

  it("matches without www.", () => {
    expect(matchLineEmbed(`https://youtube.com/watch?v=${VIDEO_ID}`)).toEqual({
      type: "youtube",
      videoId: VIDEO_ID,
    });
  });

  it("matches without a scheme", () => {
    expect(matchLineEmbed(`www.youtube.com/watch?v=${VIDEO_ID}`)).toEqual({
      type: "youtube",
      videoId: VIDEO_ID,
    });
  });

  it("matches a watch URL with extra query params in any order", () => {
    expect(matchLineEmbed(`https://www.youtube.com/watch?list=PL123&v=${VIDEO_ID}&t=30s`)).toEqual({
      type: "youtube",
      videoId: VIDEO_ID,
    });
  });

  it("matches a youtu.be short link", () => {
    expect(matchLineEmbed(`https://youtu.be/${VIDEO_ID}`)).toEqual({ type: "youtube", videoId: VIDEO_ID });
  });

  it("matches a youtu.be short link with a query string", () => {
    expect(matchLineEmbed(`https://youtu.be/${VIDEO_ID}?t=42`)).toEqual({ type: "youtube", videoId: VIDEO_ID });
  });

  it("matches an /embed/ URL", () => {
    expect(matchLineEmbed(`https://www.youtube.com/embed/${VIDEO_ID}`)).toEqual({
      type: "youtube",
      videoId: VIDEO_ID,
    });
  });

  it("matches a /shorts/ URL", () => {
    expect(matchLineEmbed(`https://www.youtube.com/shorts/${VIDEO_ID}`)).toEqual({
      type: "youtube",
      videoId: VIDEO_ID,
    });
  });

  it("tolerates surrounding whitespace on the line", () => {
    expect(matchLineEmbed(`   https://youtu.be/${VIDEO_ID}   `)).toEqual({ type: "youtube", videoId: VIDEO_ID });
  });

  it("rejects a non-YouTube URL", () => {
    expect(matchLineEmbed("https://vimeo.com/123456")).toBeNull();
  });

  it("rejects a YouTube URL embedded in other text on the same line", () => {
    expect(matchLineEmbed(`Check this out: https://youtu.be/${VIDEO_ID}`)).toBeNull();
  });

  it("rejects a YouTube URL with trailing text", () => {
    expect(matchLineEmbed(`https://youtu.be/${VIDEO_ID} nice video`)).toBeNull();
  });

  it("rejects plain prose", () => {
    expect(matchLineEmbed("Just a regular line of text.")).toBeNull();
  });

  it("rejects an empty line", () => {
    expect(matchLineEmbed("   ")).toBeNull();
  });

  it("rejects a YouTube URL missing a video id", () => {
    expect(matchLineEmbed("https://www.youtube.com/watch")).toBeNull();
  });
});
