import type { EditorView } from "@codemirror/view";

/** Wraps the current selection in matching markers (bold/italic), or just
 * places the cursor between them with no selection. */
export function wrapSelection(view: EditorView, before: string, after: string = before) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: [
      { from, to: from, insert: before },
      { from: to, to, insert: after },
    ],
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  });
  view.focus();
}

/** Toggles a line-leading marker (heading, checklist) on the current line. */
export function toggleLinePrefix(view: EditorView, prefix: string) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const hasPrefix = line.text.startsWith(prefix);
  view.dispatch({
    changes: hasPrefix
      ? { from: line.from, to: line.from + prefix.length, insert: "" }
      : { from: line.from, to: line.from, insert: prefix },
  });
  view.focus();
}

/** Inserts a markdown link, wrapping the current selection as the link text
 * (or a placeholder) and selecting the "url" placeholder next. */
export function insertLink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to) || "link text";
  const insert = `[${text}](url)`;
  const urlStart = from + text.length + 3;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart, head: urlStart + 3 },
  });
  view.focus();
}
