import { parseExplicit } from "@/lib/jotter/parseExplicit";
import type { JotterIntent } from "@/lib/jotter/types";

export interface NoteTaskCommand {
  lineIndex: number;
  intent: JotterIntent;
}

const TASK_COMMAND_PREFIX = /^\/task\s+create\b/i;

/**
 * Finds every line in a note body that's an explicit "/task create ..."
 * Jotter command (see docs/superpowers/specs/2026-08-23-jotter-design.md's
 * Phase 2 note -- "linked tasks by typing in a note using the same
 * syntax"). Only /task lines are supported here, not /event or /note --
 * there's no note<->event link table, and note-in-note creation was never
 * part of the original idea. A line has to start with the command (leading
 * whitespace aside) and parse successfully as a task to count; anything
 * else -- ordinary prose, a malformed command, an /event or /note line --
 * is left alone for the caller to leave untouched.
 */
export function findTaskCommands(body: string, referenceDate: Date = new Date()): NoteTaskCommand[] {
  const lines = body.split("\n");
  const commands: NoteTaskCommand[] = [];

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (!TASK_COMMAND_PREFIX.test(trimmed)) return;

    const parsed = parseExplicit(trimmed, referenceDate);
    if (parsed.ok && parsed.intent && parsed.intent.route === "task") {
      commands.push({ lineIndex, intent: parsed.intent });
    }
  });

  return commands;
}
