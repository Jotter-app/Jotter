import { format } from "date-fns";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { parseEmbeddedQuery } from "@/lib/jotter/parseEmbeddedQuery";
import { runEmbeddedQuery, type EmbeddedQueryResult, type QueryableNote, type QueryableTask } from "@/lib/jotter/runEmbeddedQuery";
import { formatRelativeDays } from "@/lib/dates/relativeDays";

class EmbeddedQueryWidget extends WidgetType {
  constructor(
    private readonly result: EmbeddedQueryResult<QueryableTask | QueryableNote>,
    private readonly pillar: "task" | "note",
    private readonly onToggleTask: (taskId: string, checked: boolean, dueAt: string | null) => void
  ) {
    super();
  }

  // Always rebuilds -- results can change whenever the page's
  // queryableTasks/queryableNotes props refresh, and correctly diffing a
  // short result list isn't worth the complexity at this app's scale.
  eq() {
    return false;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-query-wrapper";

    if (this.result.items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "cm-md-query-empty";
      empty.textContent = this.pillar === "task" ? "No matching tasks." : "No matching notes.";
      wrapper.appendChild(empty);
      return wrapper;
    }

    const list = document.createElement("ul");
    list.className = "cm-md-query-list";

    for (const item of this.result.items) {
      const row = document.createElement("li");
      row.className = "cm-md-query-row";

      if (this.pillar === "task") {
        const task = item as QueryableTask;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = task.completed_at !== null;
        checkbox.className = "cm-md-query-checkbox";
        checkbox.addEventListener("change", () => {
          this.onToggleTask(task.id, checkbox.checked, task.due_at);
        });
        row.appendChild(checkbox);

        const title = document.createElement("span");
        title.className = task.completed_at ? "cm-md-query-title cm-md-query-title-done" : "cm-md-query-title";
        title.textContent = task.title;
        row.appendChild(title);

        if (task.due_at) {
          const due = document.createElement("span");
          due.className = "cm-md-query-due";
          const dueDate = new Date(task.due_at);
          due.textContent = `${formatRelativeDays(dueDate)} · ${format(dueDate, "MMM d, h:mm a")}`;
          row.appendChild(due);
        }
      } else {
        const note = item as QueryableNote;
        const link = document.createElement("a");
        link.href = `/notes/${note.id}`;
        link.className = "cm-md-query-title cm-md-query-link";
        link.textContent = note.title || "Untitled";
        row.appendChild(link);
      }

      list.appendChild(row);
    }
    wrapper.appendChild(list);

    if (this.result.totalCount > this.result.items.length) {
      const more = document.createElement("p");
      more.className = "cm-md-query-more";
      more.textContent = `+${this.result.totalCount - this.result.items.length} more`;
      wrapper.appendChild(more);
    }

    return wrapper;
  }

  // Lets the checkbox's native change event and the note link's native
  // navigation behave normally instead of CM6 treating clicks inside as a
  // cursor-placement gesture -- same role as lineEmbedPlugin's
  // YoutubeEmbedWidget.ignoreEvent.
  ignoreEvent() {
    return true;
  }
}

interface DecoEntry {
  from: number;
  to: number;
  deco: Decoration;
}

function buildQueryDecorations(
  view: EditorView,
  getTasks: () => QueryableTask[],
  getNotes: () => QueryableNote[],
  onToggleTask: (taskId: string, checked: boolean, dueAt: string | null) => void
): DecorationSet {
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
      if (activeLines.has(n)) continue;
      const line = doc.line(n);
      const query = parseEmbeddedQuery(line.text);
      if (!query) continue;

      const result = runEmbeddedQuery(query, { tasks: getTasks(), notes: getNotes() });
      entries.push({
        from: line.from,
        to: line.to,
        deco: Decoration.replace({ widget: new EmbeddedQueryWidget(result, query.pillar, onToggleTask) }),
      });
    }
  }

  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) builder.add(entry.from, entry.to, entry.deco);
  return builder.finish();
}

// Factory (like createWikilinkExtensions/createLiveMarkdownPlugin) since
// this needs live access to the page's task/note snapshot and a callback
// into React for toggling a task -- callers pass getters/callbacks backed
// by refs kept fresh by the caller.
export function createEmbeddedQueryPlugin(
  getTasks: () => QueryableTask[],
  getNotes: () => QueryableNote[],
  onToggleTask: (taskId: string, checked: boolean, dueAt: string | null) => void
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildQueryDecorations(view, getTasks, getNotes, onToggleTask);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildQueryDecorations(update.view, getTasks, getNotes, onToggleTask);
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}

export const embeddedQueryTheme = EditorView.theme({
  ".cm-md-query-wrapper": {
    display: "block",
    margin: "0.25rem 0",
    padding: "0.5rem 0.75rem",
    borderRadius: "0.5rem",
    border: "1px solid var(--border)",
    backgroundColor: "var(--muted)",
  },
  ".cm-md-query-empty": {
    margin: 0,
    fontSize: "0.8125rem",
    color: "var(--muted-foreground)",
  },
  ".cm-md-query-list": {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  ".cm-md-query-row": {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.8125rem",
  },
  ".cm-md-query-checkbox": {
    cursor: "pointer",
  },
  ".cm-md-query-title": {
    flex: "1",
  },
  ".cm-md-query-title-done": {
    color: "var(--muted-foreground)",
    textDecoration: "line-through",
  },
  ".cm-md-query-link": {
    color: "var(--primary)",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  ".cm-md-query-due": {
    flexShrink: "0",
    fontSize: "0.75rem",
    color: "var(--muted-foreground)",
  },
  ".cm-md-query-more": {
    margin: "0.25rem 0 0",
    fontSize: "0.75rem",
    color: "var(--muted-foreground)",
  },
});
