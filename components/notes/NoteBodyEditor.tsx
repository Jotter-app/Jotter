"use client";

import { useEffect, useRef, useState } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExtension } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";

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

interface MenuState {
  top: number;
  left: number;
  lineStart: number;
  command: SlashCommand;
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
export function NoteBodyEditor({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<MenuState | null>(null);

  // Kept fresh via an effect rather than assigned directly during render --
  // these refs are read from inside CM6 extension closures set up once at
  // mount (see below), which would otherwise only ever see the initial
  // `onChange`/`menu` values.
  useEffect(() => {
    onChangeRef.current = onChange;
    menuRef.current = menu;
  });

  function evaluateSlashTrigger(view: EditorView) {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const linePrefix = line.text.slice(0, cursor - line.from);
    const match = linePrefix.match(SLASH_TRIGGER);
    const partial = match?.[1].toLowerCase();
    const command = partial !== undefined ? SLASH_COMMANDS.find((c) => c.keyword.startsWith(partial)) : undefined;

    if (!command) {
      setMenu(null);
      return;
    }

    const coords = view.coordsAtPos(cursor);
    const wrapperRect = containerRef.current?.getBoundingClientRect();
    if (!coords || !wrapperRect) {
      setMenu(null);
      return;
    }

    setMenu({
      top: coords.bottom - wrapperRect.top,
      left: coords.left - wrapperRect.left,
      lineStart: line.from,
      command,
    });
  }

  function selectCommand(view: EditorView, state: MenuState) {
    const cursor = view.state.selection.main.head;
    view.dispatch({
      changes: { from: state.lineStart, to: cursor, insert: state.command.template },
      selection: { anchor: state.lineStart + state.command.template.length },
    });
    setMenu(null);
    view.focus();
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
                selectCommand(view, menuRef.current);
                return true;
              },
            },
            {
              key: "Tab",
              run: (view) => {
                if (!menuRef.current) return false;
                selectCommand(view, menuRef.current);
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
        markdown({ extensions: [GFM] }),
        EditorView.lineWrapping,
        editorTheme,
        placeholderExtension(placeholder ?? ""),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
          if (update.docChanged || update.selectionSet) {
            evaluateSlashTrigger(update.view);
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
      {menu && (
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
              if (viewRef.current) selectCommand(viewRef.current, menu);
            }}
          >
            <span className="font-medium">{menu.command.label}</span>
            <span className="text-xs text-muted-foreground">{menu.command.hint}</span>
          </button>
        </div>
      )}
    </div>
  );
}
