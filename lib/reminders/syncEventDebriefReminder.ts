import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Keeps an event's post-meeting debrief reminder in sync with whether it
 * has a linked note. reminders.event_id already exists and the delivery
 * pipeline (supabase/functions/send-reminders) already has a full event_id
 * branch -- nothing has ever populated it before this, so every event_id
 * reminder going forward IS a debrief (fired at end_at, not start_at) by
 * construction, not by a separate "kind" column.
 *
 * Only ever touches the event's *unsent* reminder (sent_at is null), same
 * invariant syncTaskReminder maintains for tasks.
 */
export async function syncEventDebriefReminder(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  debriefAt: string | null
) {
  const { data: existing } = await supabase
    .from("reminders")
    .select("id")
    .eq("event_id", eventId)
    .is("sent_at", null)
    .maybeSingle();

  if (!debriefAt) {
    if (existing) {
      await supabase.from("reminders").delete().eq("id", existing.id);
    }
    return;
  }

  if (existing) {
    await supabase.from("reminders").update({ fire_at: debriefAt }).eq("id", existing.id);
  } else {
    await supabase.from("reminders").insert({
      user_id: userId,
      event_id: eventId,
      fire_at: debriefAt,
      channel: "push",
    });
  }
}
