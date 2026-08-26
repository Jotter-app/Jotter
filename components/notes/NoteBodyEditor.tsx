"use client";

import { useRef, useState } from "react";
import { getCaretCoordinates } from "@/lib/dom/getCaretCoordinates";

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

/**
 * Wraps the note body <textarea> with a Notion-style "/" command menu, so
 * typing /task create's syntax doesn't have to be memorized. Only ever
 * triggers at the start of a line (a trailing "/" mid-sentence is just
 * punctuation), and closes as soon as what's typed after it stops being a
 * prefix of a known command -- at which point the user is just typing
 * normally, whether that's the command spelled out by hand or unrelated
 * text.
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  function evaluateTrigger(text: string, cursor: number) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMenu(null);
      return;
    }

    const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
    const linePrefix = text.slice(lineStart, cursor);
    const match = linePrefix.match(SLASH_TRIGGER);
    const partial = match?.[1].toLowerCase();
    const command = partial !== undefined ? SLASH_COMMANDS.find((c) => c.keyword.startsWith(partial)) : undefined;

    if (!command) {
      setMenu(null);
      return;
    }

    const coords = getCaretCoordinates(textarea, cursor);
    setMenu({
      top: coords.top + coords.height - textarea.scrollTop,
      left: coords.left - textarea.scrollLeft,
      lineStart,
      command,
    });
  }

  function selectCommand(command: SlashCommand, lineStart: number) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursor = textarea.selectionStart;
    const newValue = value.slice(0, lineStart) + command.template + value.slice(cursor);
    const newCursor = lineStart + command.template.length;

    onChange(newValue);
    setMenu(null);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursor, newCursor);
    });
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    evaluateTrigger(e.target.value, e.target.selectionStart);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!menu) return;

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectCommand(menu.command, menu.lineStart);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMenu(null);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setMenu(null)}
        placeholder={placeholder}
        className={className}
      />
      {menu && (
        <div
          className="absolute z-10 w-72 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ top: menu.top, left: menu.left }}
        >
          <button
            type="button"
            className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            // Prevents the textarea from blurring on click, which would
            // otherwise close the menu (via onBlur) before this handler
            // ever runs.
            onMouseDown={(e) => {
              e.preventDefault();
              selectCommand(menu.command, menu.lineStart);
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
