"use server";

import { format, startOfWeek, endOfWeek } from "date-fns";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId } from "@/lib/supabase/session";
import { insertNoteCore } from "@/lib/actions/notes";
import { getOrCreateFolderByName } from "@/lib/notes/getOrCreateFolderByName";
import type { Database } from "@/lib/supabase/database.types";

const WEEKLY_REVIEWS_FOLDER = "Weekly Reviews";

/**
 * Deliberately not built like the daily note's live-query body -- a review
 * describes a fixed, already-over period. Its retrospective sections
 * (completed tasks, notes touched) are computed once here and written as
 * plain markdown, not embedded query lines: a live `?tasks status:done`
 * query has no time bound (it'd show every done task ever, not just this
 * week's), and even bounded, a task un-checked later would vanish from a
 * review of what already happened, which defeats the point of a review.
 * Only the forward-looking "Upcoming" section stays live.
 */
export async function getOrCreateWeeklyReviewCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  referenceDate: Date
): Promise<string | null> {
  const folderId = await getOrCreateFolderByName(supabase, userId, WEEKLY_REVIEWS_FOLDER);
  if (!folderId) return null;

  const weekStart = startOfWeek(referenceDate);
  const weekEnd = endOfWeek(referenceDate);
  const title = `Week of ${format(weekStart, "MMM d")}–${format(weekEnd, "MMM d, yyyy")}`;

  const { data: existing } = await supabase.from("notes").select("id").eq("folder_id", folderId).eq("title", title).maybeSingle();
  if (existing) return existing.id;

  const [{ data: completed }, { data: touched }] = await Promise.all([
    supabase
      .from("tasks")
      .select("title")
      .eq("user_id", userId)
      .gte("completed_at", weekStart.toISOString())
      .lte("completed_at", weekEnd.toISOString())
      .order("completed_at"),
    supabase
      .from("notes")
      .select("title")
      .eq("user_id", userId)
      .gte("updated_at", weekStart.toISOString())
      .lte("updated_at", weekEnd.toISOString())
      .order("updated_at"),
  ]);

  // Plain "- [x] title", deliberately without formatTaskCheckboxLine's
  // <!-- task:<uuid> --> marker -- an interactive, uncheckable checkbox
  // implies live state, and unchecking something in a retrospective of a
  // finished week doesn't mean anything.
  const completedSection = completed?.length
    ? completed.map((t) => `- [x] ${t.title}`).join("\n")
    : "_Nothing completed this week._";
  // [[wikilinks]] instead of plain links -- reuses the existing wikilink
  // resolver/backlinks panel as-is, so a note this review mentions can see
  // itself referenced back, at no extra implementation cost.
  const touchedSection = touched?.length
    ? touched.map((n) => `- [[${n.title}]]`).join("\n")
    : "_No notes touched this week._";

  const bodyMarkdown = `## Completed this week\n${completedSection}\n\n## Notes touched this week\n${touchedSection}\n\n## Upcoming\n?tasks due:week\n`;
  const result = await insertNoteCore(supabase, userId, { folderId, title, bodyMarkdown });
  return result.noteId;
}

export async function openThisWeeksReview() {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;

  const noteId = await getOrCreateWeeklyReviewCore(supabase, userId, new Date());
  if (noteId) redirect(`/notes/${noteId}`);
}
