import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { matchLineEmbed } from "@/lib/markdown/lineEmbeds";

class YoutubeEmbedWidget extends WidgetType {
  constructor(
    private readonly videoId: string,
    private readonly from: number,
    private readonly to: number
  ) {
    super();
  }

  eq(other: YoutubeEmbedWidget) {
    return other.videoId === this.videoId && other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-embed-wrapper";

    const embed = document.createElement("div");
    embed.className = "cm-md-embed";
    const iframe = document.createElement("iframe");
    // youtube-nocookie.com avoids setting tracking cookies until the video
    // is actually played.
    iframe.src = `https://www.youtube-nocookie.com/embed/${this.videoId}`;
    iframe.title = "YouTube video";
    iframe.loading = "lazy";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    embed.appendChild(iframe);

    // A full-line replace decoration is atomic for cursor movement (arrow
    // keys skip over it entirely, and the iframe swallows every click via
    // ignoreEvent below) -- with no other way to land a cursor on this
    // line, there'd be no way to ever edit or remove the URL. This button
    // moves the cursor there directly instead.
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "cm-md-embed-edit";
    editButton.textContent = "Edit link";
    editButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.to } });
      view.focus();
    });
    wrapper.appendChild(embed);
    wrapper.appendChild(editButton);
    return wrapper;
  }

  // Lets clicks/drags inside the iframe (play, scrub, fullscreen) behave
  // normally instead of CM6 treating them as a cursor-placement gesture.
  // The edit button still works despite this -- it has its own listener,
  // which fires independent of CM6's ignoreEvent handling.
  ignoreEvent() {
    return true;
  }
}

function buildLineEmbedDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;

  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = doc.lineAt(range.from).number;
    const endLine = doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) activeLines.add(n);
  }

  const entries: { from: number; to: number; deco: Decoration }[] = [];

  for (const { from, to } of view.visibleRanges) {
    const firstLine = doc.lineAt(from).number;
    const lastLine = doc.lineAt(to).number;
    for (let n = firstLine; n <= lastLine; n++) {
      if (activeLines.has(n)) continue;
      const line = doc.line(n);
      const match = matchLineEmbed(line.text);
      if (!match) continue;
      // Inline (not block: true) replace -- same reason as
      // liveMarkdownPlugin's horizontal-rule widget: block decorations
      // can't come from a ViewPlugin, and an inline widget looks identical
      // here since it's replacing an entire line's only content.
      entries.push({
        from: line.from,
        to: line.to,
        deco: Decoration.replace({ widget: new YoutubeEmbedWidget(match.videoId, line.from, line.to) }),
      });
    }
  }

  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) builder.add(entry.from, entry.to, entry.deco);
  return builder.finish();
}

export const lineEmbedPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLineEmbedDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLineEmbedDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

export const lineEmbedTheme = EditorView.theme({
  ".cm-md-embed-wrapper": {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    margin: "0.25rem 0",
  },
  ".cm-md-embed": {
    display: "block",
    width: "100%",
    maxWidth: "480px",
    aspectRatio: "16 / 9",
    borderRadius: "0.5rem",
    overflow: "hidden",
    backgroundColor: "var(--muted)",
  },
  ".cm-md-embed iframe": {
    display: "block",
    width: "100%",
    height: "100%",
    border: "0",
  },
  ".cm-md-embed-edit": {
    flexShrink: 0,
    marginTop: "0.25rem",
    padding: "0.125rem 0.5rem",
    fontSize: "0.75rem",
    color: "var(--muted-foreground)",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "0.375rem",
    cursor: "pointer",
  },
  ".cm-md-embed-edit:hover": {
    color: "var(--foreground)",
    borderColor: "var(--foreground)",
  },
});
