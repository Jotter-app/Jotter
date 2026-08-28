"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExtension } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { createLiveMarkdownPlugin, linkClickHandler, liveMarkdownTheme } from "@/components/notes/editor/liveMarkdownPlugin";
import { headingFoldExtension, suppressDefaultBlockFold } from "@/components/notes/editor/headingFold";
import { createWikilinkExtensions, type WikilinkTarget } from "@/components/notes/editor/wikilinkPlugin";
import { lineEmbedPlugin, lineEmbedTheme } from "@/components/notes/editor/lineEmbedPlugin";
import { createDateDetectionPlugin, dateDetectionTheme } from "@/components/notes/editor/dateDetectionPlugin";
import { createEmbeddedQueryPlugin, embeddedQueryTheme } from "@/components/notes/editor/embeddedQueryPlugin";
import type { WikilinkCandidate } from "@/lib/notes/resolveWikilink";
import type { QueryableNote, QueryableTask } from "@/lib/jotter/runEmbeddedQuery";

interface SlashCommand {
  keyword: string;
  template: string;
  label: string;
  hint: string;
}

// Only /task is supported inline (see lib/jotter/parseNoteCommands.ts) --
// there's no note<->event link table, and note-in-note creation was never
// part of the original idea. Add more entries here if that ever changes.
const SLASH_COMMANDS: SlashCommand[] = [
  {
    keyword: "task",
    template: '/task create "',
    label: "/task create",
    hint: 'Add a linked task, e.g. "title" tomorrow 5pm #tag',
  },
];

// The whole current line (from its start up to the cursor) has to be just
// "/" plus optional word characters -- matches where findTaskCommands
// looks for commands, and keeps this from firing mid-sentence.
const SLASH_TRIGGER = /^\/(\w*)$/i;

// An unclosed "[[" anywhere on the current line, with no "]" or "["
// after it -- the same regex shape used by wikilinkPlugin.ts to decide a
// wikilink isn't terminated yet.
const WIKILINK_TRIGGER = /\[\[([^[\]]*)$/;
const WIKILINK_CANDIDATE_LIMIT = 8;

interface SlashMenuState {
  kind: "slash";
  top: number;
  left: number;
  lineStart: number;
  command: SlashCommand;
}

interface WikilinkMenuState {
  kind: "wikilink";
  top: number;
  left: number;
  from: number;
  to: number;
  candidates: WikilinkCandidate[];
}

type MenuState = SlashMenuState | WikilinkMenuState;

// Only the fields the checkbox widget needs to correlate a marked line back
// to its real task and restore its reminder on un-completion.
interface LinkedTaskInfo {
  id: string;
  due_at: string | null;
}

// Matches this app's CSS-variable theme (see app/globals.css) rather than a
// packaged CM6 theme, so light/dark just falls out of the same .dark class
// toggle next-themes already applies -- no JS-side theme switching needed.
// Font/size/background/border intentionally inherit from the wrapper div's
// own Tailwind classes (passed in via `className`) instead of being
// hardcoded here, so this component's visual chrome stays driven by the
// caller exactly like the old <textarea> was.
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontFamily: "inherit",
    fontSize: "inherit",
    color: "inherit",
    backgroundColor: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", overflow: "auto" },
  ".cm-content": { padding: 0, caretColor: "var(--foreground)" },
  ".cm-line": { padding: 0 },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
});

/**
 * Hand-rolled React<->CodeMirror 6 wrapper. Not using a wrapper library
 * (e.g. @uiw/react-codemirror) since the live-preview decorations, heading
 * folding, and wikilink/embed widgets this editor needs (see
 * docs/superpowers/specs/2026-08-26-note-editor-live-preview-design.md) are
 * all custom CM6 extensions a wrapper would just sit awkwardly on top of --
 * matches this repo's existing preference for hand-rolled focused code
 * (e.g. the caret-coordinates mirror-div this replaces) over pulling in an
 * abstraction layer for a problem that's mostly "write CM6 extensions"
 * anyway.
 */
export interface NoteBodyEditorHandle {
  /** The live CodeMirror view, for the formatting toolbar's commands
   * (components/notes/editor/formattingCommands.ts) -- null before mount. */
  getView: () => EditorView | null;
}

export const NoteBodyEditor = forwardRef<
  NoteBodyEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    allNoteTitles?: WikilinkCandidate[];
    onWikilinkClick?: (target: WikilinkTarget) => void;
    linkedTasks?: LinkedTaskInfo[];
    onToggleLinkedTask?: (taskId: string, checked: boolean, dueAt: string | null) => void;
    onCreateEvent?: (lineText: string, markerInsertPos: number) => void;
    queryableTasks?: QueryableTask[];
    queryableNotes?: QueryableNote[];
    onToggleQueryTask?: (taskId: string, checked: boolean, dueAt: string | null) => void;
  }
>(function NoteBodyEditor(
  {
    value,
    onChange,
    placeholder,
    className,
    allNoteTitles = [],
    onWikilinkClick,
    linkedTasks = [],
    onToggleLinkedTask,
    onCreateEvent,
    queryableTasks = [],
    queryableNotes = [],
    onToggleQueryTask,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const allNoteTitlesRef = useRef(allNoteTitles);
  const onWikilinkClickRef = useRef(onWikilinkClick);
  const linkedTasksRef = useRef(linkedTasks);
  const onToggleLinkedTaskRef = useRef(onToggleLinkedTask);
  const onCreateEventRef = useRef(onCreateEvent);
  const queryableTasksRef = useRef(queryableTasks);
  const queryableNotesRef = useRef(queryableNotes);
  const onToggleQueryTaskRef = useRef(onToggleQueryTask);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<MenuState | null>(null);

  useImperativeHandle(ref, () => ({ getView: () => viewRef.current }), []);

  // Kept fresh via an effect rather than assigned directly during render --
  // these refs are read from inside CM6 extension closures set up once at
  // mount (see below), which would otherwise only ever see the initial
  // prop/state values.
  useEffect(() => {
    onChangeRef.current = onChange;
    allNoteTitlesRef.current = allNoteTitles;
    onWikilinkClickRef.current = onWikilinkClick;
    linkedTasksRef.current = linkedTasks;
    onToggleLinkedTaskRef.current = onToggleLinkedTask;
    onCreateEventRef.current = onCreateEvent;
    queryableTasksRef.current = queryableTasks;
    queryableNotesRef.current = queryableNotes;
    onToggleQueryTaskRef.current = onToggleQueryTask;
    menuRef.current = menu;
  });

  function evaluateMenus(view: EditorView) {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const linePrefix = line.text.slice(0, cursor - line.from);

    const coords = view.coordsAtPos(cursor);
    const wrapperRect = containerRef.current?.getBoundingClientRect();
    if (!coords || !wrapperRect) {
      setMenu(null);
      return;
    }
    const top = coords.bottom - wrapperRect.top;
    const left = coords.left - wrapperRect.left;

    const slashMatch = linePrefix.match(SLASH_TRIGGER);
    const partial = slashMatch?.[1].toLowerCase();
    const command = partial !== undefined ? SLASH_COMMANDS.find((c) => c.keyword.startsWith(partial)) : undefined;
    if (command) {
      setMenu({ kind: "slash", top, left, lineStart: line.from, command });
      return;
    }

    const wikiMatch = linePrefix.match(WIKILINK_TRIGGER);
    if (wikiMatch) {
      const query = wikiMatch[1].trim().toLowerCase();
      const candidates = allNoteTitlesRef.current
        .filter((t) => t.title.toLowerCase().includes(query))
        .slice(0, WIKILINK_CANDIDATE_LIMIT);
      if (candidates.length > 0) {
        setMenu({ kind: "wikilink", top, left, from: cursor - wikiMatch[0].length, to: cursor, candidates });
        return;
      }
    }

    setMenu(null);
  }

  function selectSlashCommand(view: EditorView, state: SlashMenuState) {
    const cursor = view.state.selection.main.head;
    view.dispatch({
      changes: { from: state.lineStart, to: cursor, insert: state.command.template },
      selection: { anchor: state.lineStart + state.command.template.length },
    });
    setMenu(null);
    view.focus();
  }

  function selectWikilinkCandidate(view: EditorView, state: WikilinkMenuState, candidate: WikilinkCandidate) {
    const insert = `[[${candidate.title}]]`;
    view.dispatch({
      changes: { from: state.from, to: state.to, insert },
      selection: { anchor: state.from + insert.length },
    });
    setMenu(null);
    view.focus();
  }

  function selectMenuItem(view: EditorView, state: MenuState) {
    if (state.kind === "slash") selectSlashCommand(view, state);
    else selectWikilinkCandidate(view, state, state.candidates[0]);
  }

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        // Highest precedence: without this, @codemirror/lang-markdown's own
        // Enter binding (list continuation, etc.) runs first regardless of
        // where this keymap sits in the extensions array -- CM6 resolves
        // keymap precedence independently of array position unless told
        // otherwise, so relying on ordering alone silently loses to it.
        Prec.highest(
          keymap.of([
            {
              key: "Enter",
              run: (view) => {
                if (!menuRef.current) return false;
                selectMenuItem(view, menuRef.current);
                return true;
              },
            },
            {
              key: "Tab",
              run: (view) => {
                if (!menuRef.current) return false;
                selectMenuItem(view, menuRef.current);
                return true;
              },
            },
            {
              key: "Escape",
              run: () => {
                if (!menuRef.current) return false;
                setMenu(null);
                return true;
              },
            },
          ])
        ),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ extensions: [GFM, suppressDefaultBlockFold] }),
        createLiveMarkdownPlugin(
          (taskId) => linkedTasksRef.current.find((t) => t.id === taskId)?.due_at ?? null,
          (taskId, checked, dueAt) => onToggleLinkedTaskRef.current?.(taskId, checked, dueAt)
        ),
        linkClickHandler,
        headingFoldExtension,
        createWikilinkExtensions(
          () => allNoteTitlesRef.current,
          (target) => onWikilinkClickRef.current?.(target)
        ),
        lineEmbedPlugin,
        lineEmbedTheme,
        createDateDetectionPlugin((lineText, markerInsertPos) => onCreateEventRef.current?.(lineText, markerInsertPos)),
        dateDetectionTheme,
        createEmbeddedQueryPlugin(
          () => queryableTasksRef.current,
          () => queryableNotesRef.current,
          (taskId, checked, dueAt) => onToggleQueryTaskRef.current?.(taskId, checked, dueAt)
        ),
        embeddedQueryTheme,
        EditorView.lineWrapping,
        editorTheme,
        liveMarkdownTheme,
        placeholderExtension(placeholder ?? ""),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
          if (update.docChanged || update.selectionSet) {
            evaluateMenus(update.view);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mounted once; `value`/`placeholder` changes after mount are handled
    // by the effects below rather than by re-running this one, which would
    // otherwise tear down and rebuild the whole editor (losing undo
    // history, selection, scroll position) on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Syncs an external value change (e.g. the conflict banner's "Reload
  // latest") into the doc. Guarded by an equality check so this never
  // fires from the editor's own onChange -> parent state -> prop-back-down
  // round trip, which would otherwise clobber the user's cursor/selection
  // on every keystroke.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return (
    <div className="relative">
      <div ref={containerRef} className={className} />
      {menu?.kind === "slash" && (
        <div
          className="absolute z-10 w-72 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ top: menu.top, left: menu.left }}
        >
          <button
            type="button"
            className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            // Prevents CM6's contenteditable from blurring on click, which
            // would otherwise close the menu (via a blur-driven check)
            // before this handler runs -- same trick the previous
            // textarea-based menu used.
            onMouseDown={(e) => {
              e.preventDefault();
              if (viewRef.current) selectSlashCommand(viewRef.current, menu);
            }}
          >
            <span className="font-medium">{menu.command.label}</span>
            <span className="text-xs text-muted-foreground">{menu.command.hint}</span>
          </button>
        </div>
      )}
      {menu?.kind === "wikilink" && (
        <div
          className="absolute z-10 w-64 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ top: menu.top, left: menu.left }}
        >
          {menu.candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                if (viewRef.current) selectWikilinkCandidate(viewRef.current, menu, candidate);
              }}
            >
              {candidate.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
