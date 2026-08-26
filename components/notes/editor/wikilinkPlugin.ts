import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { resolveWikilinkTitle, type WikilinkCandidate } from "@/lib/notes/resolveWikilink";

export type WikilinkTarget = { noteId: string } | { brokenTitle: string };

// An independent regex-over-visible-lines plugin rather than a Lezer
// grammar extension -- [[wikilinks]] aren't part of markdown/GFM, and a
// custom Lezer InlineParser would be meaningfully more complex for no real
// benefit at this app's scale. Unterminated `[[` (no closing `]]` yet)
// never matches, so it's simply never treated as a link.
const WIKILINK_RE = /\[\[([^[\]]+)\]\]/g;

const HIDE = Decoration.replace({});

interface DecoEntry {
  from: number;
  to: number;
  deco: Decoration;
}

function buildWikilinkDecorations(view: EditorView, candidates: WikilinkCandidate[]): DecorationSet {
  const { state } = view;
  const doc = state.doc;

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
      const line = doc.line(n);
      const active = activeLines.has(n);

      WIKILINK_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = WIKILINK_RE.exec(line.text))) {
        const title = match[1].trim();
        const matchFrom = line.from + match.index;
        const matchTo = matchFrom + match[0].length;
        const openTo = matchFrom + 2;
        const closeFrom = matchTo - 2;
        const resolved = resolveWikilinkTitle(title, candidates);

        if (closeFrom > openTo) {
          const attributes: Record<string, string> = resolved
            ? { class: "cursor-pointer text-primary underline underline-offset-2", "data-note-id": resolved.id }
            : {
                class: "cursor-pointer text-destructive underline decoration-dashed underline-offset-2",
                "data-broken-title": title,
              };
          entries.push({ from: openTo, to: closeFrom, deco: Decoration.mark({ attributes }) });
        }

        if (!active) {
          entries.push({ from: matchFrom, to: openTo, deco: HIDE });
          entries.push({ from: closeFrom, to: matchTo, deco: HIDE });
        }
      }
    }
  }

  entries.sort((a, b) => a.from - b.from || a.deco.startSide - b.deco.startSide);
  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) builder.add(entry.from, entry.to, entry.deco);
  return builder.finish();
}

// Factory (not a bare exported extension, unlike liveMarkdownPlugin) since
// this needs live access to the note's candidate title list and a callback
// into React for navigation/creation -- both change over the component's
// lifetime in ways a module-level extension can't see. Callers pass getters
// that read from refs kept fresh by the caller, same pattern NoteBodyEditor
// already uses for onChange/menu.
export function createWikilinkExtensions(getCandidates: () => WikilinkCandidate[], onClick: (target: WikilinkTarget) => void) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildWikilinkDecorations(view, getCandidates());
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildWikilinkDecorations(update.view, getCandidates());
        }
      }
    },
    { decorations: (v) => v.decorations }
  );

  // Ctrl/Cmd+click, matching the same convention liveMarkdownPlugin uses
  // for regular markdown links -- one interaction pattern for "follow this
  // link" throughout the editor.
  const clickHandler = EditorView.domEventHandlers({
    mousedown(event) {
      if (!(event.metaKey || event.ctrlKey)) return false;
      const el = (event.target as HTMLElement).closest("[data-note-id],[data-broken-title]");
      if (!el) return false;
      event.preventDefault();
      const noteId = el.getAttribute("data-note-id");
      const brokenTitle = el.getAttribute("data-broken-title");
      if (noteId) onClick({ noteId });
      else if (brokenTitle) onClick({ brokenTitle });
      return true;
    },
  });

  return [plugin, clickHandler];
}
