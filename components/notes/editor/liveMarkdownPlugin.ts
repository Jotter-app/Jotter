import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";

// Zero-width "delete" for a syntax marker (e.g. the `**`/`#`/backtick
// characters) -- used everywhere the marker should hide except on the
// line the cursor currently occupies, which is the core Obsidian-style
// "Live Preview" behavior this plugin implements.
const HIDE = Decoration.replace({});

class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
    private readonly to: number,
    private readonly taskId: string | null,
    private readonly getLinkedTaskDueAt: (taskId: string) => string | null,
    private readonly onToggleTask: (taskId: string, checked: boolean, dueAt: string | null) => void
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return (
      other.checked === this.checked && other.from === this.from && other.to === this.to && other.taskId === this.taskId
    );
  }

  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className =
      "relative top-[1px] size-3.5 shrink-0 cursor-pointer rounded-[3px] border-input align-middle accent-primary";
    // Reacting to `change` (fired after the browser's own native toggle)
    // rather than intercepting the click lets the checkbox behave like a
    // normal one -- we just mirror its new state back into the doc text.
    input.addEventListener("change", () => {
      const nextChecked = !this.checked;
      view.dispatch({ changes: { from: this.from, to: this.to, insert: nextChecked ? "[x]" : "[ ]" } });
      // A checkbox with no <!-- task:<uuid> --> marker is just text, same
      // as before -- only a marked one (originating from /task create)
      // also flips the real task's completion, immediately and without a
      // forced note save (see the plan's Context section for why: saving
      // body_markdown in the background here would bump notes.updated_at
      // behind the user's back, which saveNote's optimistic-concurrency
      // check would then see as a false conflict on their next real save).
      if (this.taskId) this.onToggleTask(this.taskId, nextChecked, this.getLinkedTaskDueAt(this.taskId));
    });
    return input;
  }

  // Lets the native checkbox handle its own click/toggle instead of CM6
  // treating it as a cursor-placement gesture.
  ignoreEvent() {
    return true;
  }
}

class HrWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-md-hr";
    return hr;
  }
}

function headingLineClass(level: number): string {
  switch (level) {
    case 1:
      return "text-2xl font-bold";
    case 2:
      return "text-xl font-bold";
    case 3:
      return "text-lg font-semibold";
    case 4:
      return "text-base font-semibold";
    case 5:
      return "text-sm font-semibold text-muted-foreground";
    default:
      return "text-xs font-semibold uppercase text-muted-foreground";
  }
}

interface DecoEntry {
  from: number;
  to: number;
  deco: Decoration;
}

// Trailing metadata appended by processNoteTaskCommands -- always hidden,
// never shown even on the active line, since it's not something a person
// typed or should edit directly.
const TASK_MARKER_COMMENT = /<!-- task:([0-9a-fA-F-]+) -->\s*$/;

function buildDecorations(
  view: EditorView,
  getLinkedTaskDueAt: (taskId: string) => string | null,
  onToggleTask: (taskId: string, checked: boolean, dueAt: string | null) => void
): DecorationSet {
  const { state } = view;
  const doc = state.doc;

  // Every line touched by any selection range counts as "active" -- a
  // construct on an active line reveals its raw syntax instead of the
  // live-rendered form, so it stays editable.
  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = doc.lineAt(range.from).number;
    const endLine = doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) activeLines.add(n);
  }
  const isPosActive = (pos: number) => activeLines.has(doc.lineAt(pos).number);

  const marks: DecoEntry[] = [];
  const lines: DecoEntry[] = [];

  function addLine(pos: number, className: string) {
    lines.push({ from: doc.lineAt(pos).from, to: doc.lineAt(pos).from, deco: Decoration.line({ class: className }) });
  }
  function hide(from: number, to: number) {
    if (to > from) marks.push({ from, to, deco: HIDE });
  }
  function style(from: number, to: number, className: string) {
    if (to > from) marks.push({ from, to, deco: Decoration.mark({ class: className }) });
  }
  // Eats one trailing space after a marker (e.g. "# " or "> ") so hiding
  // the marker doesn't leave the content sitting one space indented.
  function hideMarkerAndSpace(markFrom: number, markTo: number) {
    let end = markTo;
    if (doc.sliceString(end, end + 1) === " ") end += 1;
    hide(markFrom, end);
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (nodeRef) => {
        const name = nodeRef.name;

        if (name.startsWith("ATXHeading")) {
          const level = Number(name.slice("ATXHeading".length));
          addLine(nodeRef.from, headingLineClass(level));
          if (!isPosActive(nodeRef.from)) {
            const mark = nodeRef.node.getChild("HeaderMark");
            if (mark) hideMarkerAndSpace(mark.from, mark.to);
          }
          return;
        }

        if (name === "StrongEmphasis" || name === "Emphasis" || name === "Strikethrough") {
          style(
            nodeRef.from,
            nodeRef.to,
            name === "StrongEmphasis" ? "font-bold" : name === "Emphasis" ? "italic" : "line-through"
          );
          const markName = name === "Strikethrough" ? "StrikethroughMark" : "EmphasisMark";
          const node = nodeRef.node;
          const first = node.firstChild;
          const last = node.lastChild;
          if (first?.name === markName && !isPosActive(first.from)) hide(first.from, first.to);
          if (last?.name === markName && last.from !== first?.from && !isPosActive(last.from)) {
            hide(last.from, last.to);
          }
          return;
        }

        if (name === "InlineCode") {
          style(nodeRef.from, nodeRef.to, "rounded bg-muted px-1 font-mono text-[0.85em]");
          for (const mark of nodeRef.node.getChildren("CodeMark")) {
            if (!isPosActive(mark.from)) hide(mark.from, mark.to);
          }
          return;
        }

        if (name === "FencedCode") {
          const startLine = doc.lineAt(nodeRef.from).number;
          const endLine = doc.lineAt(nodeRef.to).number;
          for (let n = startLine; n <= endLine; n++) addLine(doc.line(n).from, "cm-md-code-line");
          return;
        }

        // A multi-line blockquote's continuation lines get their QuoteMark
        // nested inside the paragraph they prefix, not as a direct child of
        // Blockquote -- handling it as its own case (rather than reaching
        // for it via Blockquote's children) means `tree.iterate` finds it
        // regardless of depth, on every quoted line.
        if (name === "QuoteMark") {
          addLine(nodeRef.from, "cm-md-quote-line");
          if (!isPosActive(nodeRef.from)) hideMarkerAndSpace(nodeRef.from, nodeRef.to);
          return;
        }

        if (name === "HorizontalRule") {
          if (!isPosActive(nodeRef.from)) {
            const line = doc.lineAt(nodeRef.from);
            // Inline (not block: true) replace -- block decorations can't
            // come from a ViewPlugin (CM6 requires a StateField for those).
            // An inline widget whose DOM renders full-width looks the same
            // here since it's replacing an entire line's only content.
            marks.push({ from: line.from, to: line.to, deco: Decoration.replace({ widget: new HrWidget() }) });
          }
          return;
        }

        if (name === "TaskMarker") {
          const checked = /x/i.test(doc.sliceString(nodeRef.from, nodeRef.to));
          const line = doc.lineAt(nodeRef.from);
          const markerMatch = TASK_MARKER_COMMENT.exec(line.text);
          const taskId = markerMatch ? markerMatch[1] : null;

          marks.push({
            from: nodeRef.from,
            to: nodeRef.to,
            deco: Decoration.replace({
              widget: new CheckboxWidget(checked, nodeRef.from, nodeRef.to, taskId, getLinkedTaskDueAt, onToggleTask),
            }),
          });

          if (markerMatch) hide(line.from + markerMatch.index, line.to);
          return;
        }

        if (name === "ListMark") {
          style(nodeRef.from, nodeRef.to, "text-muted-foreground");
          return;
        }

        if (name === "Link") {
          const node = nodeRef.node;
          const linkMarks = node.getChildren("LinkMark");
          const urlNode = node.getChild("URL");
          const opening = linkMarks[0];
          const closing = linkMarks[1];
          const textFrom = opening ? opening.to : nodeRef.from;
          const textTo = closing ? closing.from : nodeRef.to;

          if (textTo > textFrom) {
            const attributes: Record<string, string> = {
              class: "cursor-pointer text-primary underline underline-offset-2",
            };
            if (urlNode) attributes["data-href"] = doc.sliceString(urlNode.from, urlNode.to);
            marks.push({ from: textFrom, to: textTo, deco: Decoration.mark({ attributes }) });
          }

          if (opening && !isPosActive(opening.from)) hide(opening.from, opening.to);
          if (closing && !isPosActive(closing.from)) hide(closing.from, nodeRef.to);
          return;
        }

        if (name === "TableCell" || name === "TableHeader") {
          style(nodeRef.from, nodeRef.to, "px-2");
          return;
        }

        if (name === "TableDelimiter") {
          style(nodeRef.from, nodeRef.to, "text-muted-foreground");
        }
      },
    });
  }

  // RangeSetBuilder requires ascending `from`, and for ties, ascending
  // `startSide` -- reading the decoration's own `startSide` (rather than
  // guessing an order from range width) matches CM6's actual contract for
  // decorations that legitimately start at the same position, e.g. a mark
  // wrapping a whole construct and a replace-hide covering just its
  // leading marker.
  marks.sort((a, b) => a.from - b.from || a.deco.startSide - b.deco.startSide);
  lines.sort((a, b) => a.from - b.from);

  const markBuilder = new RangeSetBuilder<Decoration>();
  for (const entry of marks) markBuilder.add(entry.from, entry.to, entry.deco);

  const lineBuilder = new RangeSetBuilder<Decoration>();
  for (const entry of lines) lineBuilder.add(entry.from, entry.to, entry.deco);

  // Two builders, joined, rather than one merged sort -- line decorations
  // and mark/replace decorations have independent ordering rules, and
  // RangeSet.join is the mechanism CM6 itself uses to combine decoration
  // sources without them fighting over sort order.
  return RangeSet.join([lineBuilder.finish(), markBuilder.finish()]);
}

// A factory (like createWikilinkExtensions) rather than a bare extension --
// needs live access to linked tasks' due dates and a callback into React
// for the actual toggleTaskComplete call, both of which change over the
// component's lifetime. Callers pass getters/callbacks that read from refs
// kept fresh by the caller.
export function createLiveMarkdownPlugin(
  getLinkedTaskDueAt: (taskId: string) => string | null,
  onToggleTask: (taskId: string, checked: boolean, dueAt: string | null) => void
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, getLinkedTaskDueAt, onToggleTask);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, getLinkedTaskDueAt, onToggleTask);
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}

// Ctrl/Cmd+click follows a rendered link -- matches the standard
// code-editor convention (VS Code, etc.) and sidesteps the ambiguity a
// plain click would have between "place the cursor" and "navigate".
export const linkClickHandler = EditorView.domEventHandlers({
  mousedown(event) {
    if (!(event.metaKey || event.ctrlKey)) return false;
    const target = event.target as HTMLElement;
    const href = target.closest("[data-href]")?.getAttribute("data-href");
    if (!href) return false;
    event.preventDefault();
    window.open(href, "_blank", "noopener,noreferrer");
    return true;
  },
});

// Only for rules that would otherwise lose a specificity tie against CM6's
// own injected `.cm-line { padding: 0 }` (same-specificity single-class
// selectors, source order decides) -- compound `.cm-line.cm-md-*`
// selectors win unconditionally instead of depending on stylesheet order.
export const liveMarkdownTheme = EditorView.theme({
  ".cm-line.cm-md-quote-line": {
    borderLeft: "2px solid var(--border)",
    paddingLeft: "0.75rem",
  },
  ".cm-line.cm-md-code-line": {
    backgroundColor: "var(--muted)",
    paddingLeft: "0.5rem",
    paddingRight: "0.5rem",
  },
  ".cm-md-hr": {
    margin: "0.5rem 0",
    border: "none",
    borderTop: "1px solid var(--border)",
  },
});
