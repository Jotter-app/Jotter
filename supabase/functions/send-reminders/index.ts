// Cron-triggered Edge Function: finds due, unsent reminders and delivers
// them via Web Push, falling back to email (Resend) when push doesn't
// succeed. Always marks sent_at after an attempt, whatever the outcome --
// per the design spec, a dead push subscription must never cause the same
// reminder to be retried indefinitely.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

// Supabase auto-injects SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for every
// Edge Function; SUPABASE_SECRET_KEY is a fallback in case a future CLI
// version renames the injected var the way the dashboard API keys were
// renamed (see the publishable/secret key rename elsewhere in this repo).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY")!;

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@example.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "reminders@resend.dev";

const pushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (pushConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

interface Reminder {
  id: string;
  user_id: string;
  task_id: string | null;
  event_id: string | null;
  fire_at: string;
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: reminders, error } = await supabase
    .from("reminders")
    .select("id, user_id, task_id, event_id, fire_at")
    .lte("fire_at", new Date().toISOString())
    .is("sent_at", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = [];
  for (const reminder of (reminders ?? []) as Reminder[]) {
    results.push(await processReminder(supabase, reminder));
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function processReminder(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  reminder: Reminder
) {
  let title = "Reminder";
  let url = "/tasks";

  if (reminder.task_id) {
    const { data: task } = await supabase
      .from("tasks")
      .select("title")
      .eq("id", reminder.task_id)
      .maybeSingle();
    title = task?.title ? `Due: ${task.title}` : "Task reminder";
    url = "/tasks";
  } else if (reminder.event_id) {
    const { data: event } = await supabase
      .from("events")
      .select("title")
      .eq("id", reminder.event_id)
      .maybeSingle();
    title = event?.title ? `Starting: ${event.title}` : "Event reminder";
    url = "/calendar";
  }

  let delivered = false;
  let lastError: string | null = null;

  if (pushConfigured) {
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", reminder.user_id);

    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({ title, url })
        );
        delivered = true;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        lastError = err instanceof Error ? err.message : String(err);
        // 404/410 = the push service says this subscription is gone for
        // good -- clean it up so we stop trying it on every future run.
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }
    if (!subscriptions || subscriptions.length === 0) {
      lastError = lastError ?? "No push subscription on file";
    }
  } else {
    lastError = "Push not configured (missing VAPID keys)";
  }

  if (!delivered && RESEND_API_KEY) {
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(reminder.user_id);
      const email = userData?.user?.email;
      if (email) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: email,
            subject: title,
            text: `Reminder: ${title}`,
          }),
        });
        if (res.ok) {
          delivered = true;
          lastError = null;
        } else {
          lastError = `Email failed: ${await res.text()}`;
        }
      } else {
        lastError = "No email on file for fallback";
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  } else if (!delivered && !RESEND_API_KEY) {
    lastError = lastError ?? "Email fallback not configured (missing RESEND_API_KEY)";
  }

  // Always mark sent_at -- successful or not, this reminder is done being
  // retried. last_error records why, for later cleanup/debugging.
  await supabase
    .from("reminders")
    .update({ sent_at: new Date().toISOString(), last_error: delivered ? null : lastError })
    .eq("id", reminder.id);

  return { id: reminder.id, delivered, error: delivered ? null : lastError };
}
