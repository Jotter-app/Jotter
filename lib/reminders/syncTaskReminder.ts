import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Keeps a task's reminder in sync with its due date -- the task's due_at
 * IS its reminder time (there's no separate "set a reminder" UI; typing
 * the time in quick-add is how you set the reminder, per the product's
 * TickTick-style intent).
 *
 * Only ever touches the task's *unsent* reminder (sent_at is null). If one
 * was already delivered and the due date changes again, a fresh reminder
 * is created for the new time rather than resurrecting the old row.
 */
export async function syncTaskReminder(
  supabase: SupabaseClient<Database>,
  userId: string,
  taskId: string,
  dueAt: string | null
) {
  const { data: existing } = await supabase
    .from("reminders")
    .select("id")
    .eq("task_id", taskId)
    .is("sent_at", null)
    .maybeSingle();

  if (!dueAt) {
    if (existing) {
      await supabase.from("reminders").delete().eq("id", existing.id);
    }
    return;
  }

  if (existing) {
    await supabase.from("reminders").update({ fire_at: dueAt }).eq("id", existing.id);
  } else {
    await supabase.from("reminders").insert({
      user_id: userId,
      task_id: taskId,
      fire_at: dueAt,
      channel: "push",
    });
  }
}
