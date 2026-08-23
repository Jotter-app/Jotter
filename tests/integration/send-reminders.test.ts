import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Requires the local Supabase stack (`supabase start`), including the
// edge-runtime container serving send-reminders and the pg_cron/pg_net
// extensions from the schedule_send_reminders migration. Invokes the real
// deployed-locally function over HTTP rather than importing Deno code into
// Vitest -- there's no push subscription or RESEND_API_KEY in this test
// user's data, so delivery naturally fails with a descriptive last_error;
// that's exactly the "always mark sent_at, whatever the outcome" behavior
// this test is verifying, with no network mocking needed.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const FUNCTION_URL = `${url}/functions/v1/send-reminders`;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

async function invokeSendReminders() {
  const res = await fetch(FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json" } });
  return res.json() as Promise<{ processed: number; results: { id: string; delivered: boolean; error: string | null }[] }>;
}

describe("send-reminders edge function", () => {
  const suffix = Date.now();
  let user: { client: SupabaseClient; userId: string };
  let taskId: string;

  let dueReminderId: string;
  let futureReminderId: string;
  let alreadySentReminderId: string;

  beforeAll(async () => {
    user = await createSignedInUser(`reminders-${suffix}@example.com`, "test-password-123");

    const { data: task, error: taskError } = await user.client
      .from("tasks")
      .insert({ user_id: user.userId, title: "Integration test task" })
      .select("id")
      .single();
    if (taskError || !task) throw new Error(`seeding task failed: ${taskError?.message}`);
    taskId = task.id;

    const insertReminder = async (fireAt: string, sentAt: string | null) => {
      const { data, error } = await user.client
        .from("reminders")
        .insert({ user_id: user.userId, task_id: taskId, fire_at: fireAt, channel: "push", sent_at: sentAt })
        .select("id")
        .single();
      if (error || !data) throw new Error(`seeding reminder failed: ${error?.message}`);
      return data.id as string;
    };

    const now = Date.now();
    dueReminderId = await insertReminder(new Date(now - 60_000).toISOString(), null);
    futureReminderId = await insertReminder(new Date(now + 3_600_000).toISOString(), null);
    alreadySentReminderId = await insertReminder(
      new Date(now - 120_000).toISOString(),
      new Date(now - 60_000).toISOString()
    );
  });

  it("processes only due, unsent reminders -- not future or already-sent ones", async () => {
    const { results } = await invokeSendReminders();
    const processedIds = results.map((r) => r.id);

    expect(processedIds).toContain(dueReminderId);
    expect(processedIds).not.toContain(futureReminderId);
    expect(processedIds).not.toContain(alreadySentReminderId);
  });

  it("marks sent_at on the due reminder even though delivery fails (no push subscription, no email configured)", async () => {
    const { data: reminder } = await user.client
      .from("reminders")
      .select("sent_at, last_error")
      .eq("id", dueReminderId)
      .single();

    expect(reminder?.sent_at).not.toBeNull();
    expect(reminder?.last_error).toBeTruthy();
  });

  it("leaves the future reminder untouched", async () => {
    const { data: reminder } = await user.client
      .from("reminders")
      .select("sent_at")
      .eq("id", futureReminderId)
      .single();

    expect(reminder?.sent_at).toBeNull();
  });

  it("does not reprocess the due reminder on a second invocation", async () => {
    const { results } = await invokeSendReminders();
    expect(results.map((r) => r.id)).not.toContain(dueReminderId);
  });
});
