import { format } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertTaskCore } from "@/lib/actions/tasks";
import { linkTaskNoteCore } from "@/lib/actions/taskNoteLinks";
import { findTaskCommands } from "@/lib/jotter/parseNoteCommands";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Scans a note body for /task create ... command lines, creates a task per
 * match linked back to the note (reusing insertTaskCore/linkTaskNoteCore
 * verbatim -- same code paths as the Cmd+K palette, not a reimplementation),
 * and replaces each processed line with a plain markdown checkbox. That
 * replacement is what makes this idempotent: a checkbox line no longer
 * matches the command pattern, so re-saving the note (which happens on
 * every edit) never creates a duplicate task for the same line. Takes
 * supabase/userId directly rather than resolving them itself, so it's
 * callable from saveNote as well as directly from integration tests.
 */
export async function processNoteTaskCommands(
  supabase: SupabaseClient<Database>,
  userId: string,
  noteId: string,
  body: string
): Promise<string> {
  const commands = findTaskCommands(body);
  if (commands.length === 0) return body;

  const lines = body.split("\n");

  for (const { lineIndex, intent } of commands) {
    const result = await insertTaskCore(supabase, userId, {
      title: intent.title,
      dueAt: intent.dueAt,
      tagNames: intent.tags,
    });
    if (!result.ok || !result.taskId) continue;

    await linkTaskNoteCore(supabase, userId, result.taskId, noteId);

    const dueText = intent.dueAt ? ` (due ${format(intent.dueAt, "MMM d, h:mm a")})` : "";
    const tagsText = intent.tags.map((tag) => ` #${tag}`).join("");
    lines[lineIndex] = `- [ ] ${intent.title}${dueText}${tagsText}`;
  }

  return lines.join("\n");
}
