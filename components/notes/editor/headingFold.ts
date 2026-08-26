import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { foldGutter, foldService, syntaxTree } from "@codemirror/language";

const ATX_HEADING = /^ATXHeading([1-6])$/;

// Scans forward from `from` for the next heading node at or above `maxLevel`
// -- that's the boundary a fold should stop at, so a heading only swallows
// its own nested content and not sibling/ancestor sections.
function findNextHeadingBoundary(state: EditorState, from: number, maxLevel: number): number {
  const tree = syntaxTree(state);
  let boundary = state.doc.length;
  let found = false;
  tree.iterate({
    from,
    to: state.doc.length,
    enter: (node) => {
      if (found) return false;
      const match = ATX_HEADING.exec(node.name);
      if (match && Number(match[1]) <= maxLevel) {
        boundary = state.doc.lineAt(node.from).from;
        found = true;
        return false;
      }
      return undefined;
    },
  });
  return boundary;
}

// Registered with `foldService`, which calls this once per candidate line.
// A heading line folds everything from the end of its own line up to (but
// not including) the next heading of the same or higher level, so
// collapsing a heading hides only what's nested under it -- Obsidian's
// heading-fold behavior, not CM6's default node-span folding (which would
// only ever span the heading's own single line).
const headingFoldService = (state: EditorState, lineStart: number, lineEnd: number) => {
  const tree = syntaxTree(state);
  let level: number | null = null;
  let headingEnd = lineEnd;
  tree.iterate({
    from: lineStart,
    to: lineEnd,
    enter: (node) => {
      const match = ATX_HEADING.exec(node.name);
      if (match) {
        level = Number(match[1]);
        headingEnd = node.to;
      }
    },
  });
  if (level === null) return null;
  const to = findNextHeadingBoundary(state, headingEnd, level);
  return to > headingEnd ? { from: headingEnd, to } : null;
};

const headingFoldTheme = EditorView.theme({
  // Overrides CM6's own hardcoded light/dark gutter colors (`&light`/
  // `&dark` in its base theme reflect a `dark: true` flag we never pass,
  // not this app's actual .dark class) with the app's own CSS variables so
  // the gutter doesn't render as a stray light-gray box in dark mode.
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--muted-foreground)",
    border: "none",
  },
  ".cm-foldGutter": {
    width: "0.9em",
    color: "var(--muted-foreground)",
  },
  ".cm-foldGutter span": {
    cursor: "pointer",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--muted)",
    border: "1px solid var(--border)",
    color: "var(--muted-foreground)",
    borderRadius: "0.25rem",
    margin: "0 2px",
    padding: "0 4px",
  },
});

// foldGutter() already pulls in codeFolding() internally -- no separate
// call needed. No fold-state persistence: a fresh EditorState per note load
// starts fully expanded by default, which is what the spec calls for.
export const headingFoldExtension = [
  foldService.of(headingFoldService),
  foldGutter({ openText: "⌄", closedText: "›" }),
  headingFoldTheme,
];
