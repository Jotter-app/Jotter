import * as chrono from "chrono-node";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";

// Written by NoteEditor's handleCreateEventFromLine once the server confirms
// the event exists -- its presence on a line is what keeps that line from
// offering "Create event?" again on every re-render, the same idempotency
// role TASK_MARKER_COMMENT plays in liveMarkdownPlugin.
const EVENT_MARKER = /<!-- event:([0-9a-fA-F-]+) -->/;

class CreateEventWidget extends WidgetType {
  constructor(
    private readonly matchText: string,
    private readonly onClick: () => void
  ) {
    super();
  }

  eq(other: CreateEventWidget) {
    return other.matchText === this.matchText;
  }

  toDOM() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-md-create-event";
    button.textContent = "Create event?";
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.onClick();
    });
    return button;
  }

  // The button handles its own click; CM6 shouldn't treat it as a
  // cursor-placement gesture.
  ignoreEvent() {
    return true;
  }
}

class EventCreatedWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-event-created";
    span.textContent = "✓ Event created";
    return span;
  }
}

interface DecoEntry {
  from: number;
  to: number;
  deco: Decoration;
}

function buildDateDecorations(
  view: EditorView,
  onCreateEvent: (lineText: string, markerInsertPos: number) => void
): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const referenceDate = new Date();

  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = doc.lineAt(range.from).number;
    const endLine = doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) activeLines.add(n);
  }

  const entries: DecoEntry[] = [];

  for (const { from, to } of view.visibleRanges) {
    const firstLine = doc.lineAt(from).number;
    const lastLine = doc.lineAt(to).number;
    for (let n = firstLine; n <= lastLine; n++) {
      if (activeLines.has(n)) continue;
      const line = doc.line(n);

      const markerMatch = EVENT_MARKER.exec(line.text);
      if (markerMatch) {
        const markerFrom = line.from + markerMatch.index;
        const markerTo = markerFrom + markerMatch[0].length;
        entries.push({
          from: markerFrom,
          to: markerTo,
          deco: Decoration.replace({ widget: new EventCreatedWidget() }),
        });
        continue;
      }

      // Only the first match per line, mirroring parseQuickAdd's own
      // "first chrono match wins" behavior -- one prompt per line, max.
      const results = chrono.parse(line.text, referenceDate, { forwardDate: true });
      if (results.length === 0) continue;
      const match = results[0];
      const matchFrom = line.from + match.index;
      const matchTo = matchFrom + match.text.length;

      entries.push({ from: matchFrom, to: matchTo, deco: Decoration.mark({ class: "cm-md-date-detected" }) });
      entries.push({
        from: matchTo,
        to: matchTo,
        deco: Decoration.widget({
          widget: new CreateEventWidget(line.text, () => onCreateEvent(line.text, matchTo)),
          side: 1,
        }),
      });
    }
  }

  entries.sort((a, b) => a.from - b.from || a.deco.startSide - b.deco.startSide);
  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) builder.add(entry.from, entry.to, entry.deco);
  return builder.finish();
}

// Factory (like createWikilinkExtensions) since this needs a live callback
// into React for the actual createEventFromNoteText call -- callers pass a
// wrapper that reads from a ref kept fresh by the caller, same pattern
// NoteBodyEditor already uses for onWikilinkClick.
export function createDateDetectionPlugin(onCreateEvent: (lineText: string, markerInsertPos: number) => void) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDateDecorations(view, onCreateEvent);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDateDecorations(update.view, onCreateEvent);
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}

export const dateDetectionTheme = EditorView.theme({
  ".cm-md-date-detected": {
    textDecoration: "underline",
    textDecorationStyle: "dashed",
    textDecorationColor: "var(--muted-foreground)",
    textUnderlineOffset: "2px",
  },
  ".cm-md-create-event": {
    marginLeft: "0.375rem",
    padding: "0.0625rem 0.375rem",
    fontSize: "0.75rem",
    color: "var(--primary)",
    backgroundColor: "transparent",
    border: "1px solid var(--primary)",
    borderRadius: "0.375rem",
    cursor: "pointer",
  },
  ".cm-md-create-event:hover": {
    backgroundColor: "var(--accent)",
  },
  ".cm-md-event-created": {
    marginLeft: "0.375rem",
    fontSize: "0.75rem",
    color: "var(--muted-foreground)",
  },
});
