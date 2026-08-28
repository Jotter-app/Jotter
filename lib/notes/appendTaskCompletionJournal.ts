import { format } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendJournalLine } from "@/lib/notes/appendJournalLine";
import type { Database } from "@/lib/supabase/database.types";

// Called from toggleTaskComplete whenever a task transitions to completed --
// every linked note (task_note_links) gets a timestamped line appended to
// its body. Returns the touched note ids so the caller can revalidate their
// pages precisely, without this module knowing about routing.
export async function appendTaskCompletionJournalCore(
  supabase: SupabaseClient<Database>,
  taskId: string,
  taskTitle: string
): Promise<string[]> {
  const { data: links } = await supabase
    .from("task_note_links")
    .select("note_id, notes(body_markdown)")
    .eq("task_id", taskId);
  if (!links || links.length === 0) return [];

  const line = `- Completed "${taskTitle}" — ${format(new Date(), "MMM d, yyyy 'at' h:mm a")}`;
  const touchedNoteIds: string[] = [];
  for (const link of links) {
    if (!link.notes) continue;
    const newBody = appendJournalLine(link.notes.body_markdown, line);
    await supabase.from("notes").update({ body_markdown: newBody }).eq("id", link.note_id);
    touchedNoteIds.push(link.note_id);
  }
  return touchedNoteIds;
}
