import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { deleteEventCore, insertEventCore, rescheduleEventCore } from "@/lib/actions/events";
import { disconnectGoogleCalendarCore, getGoogleCalendarConnectionCore } from "@/lib/actions/calendarConnections";

// Requires a running local Supabase stack (`supabase start`). Exercises the
// core functions directly (not the "use server" wrappers, which depend on
// next/headers' cookies()), same convention as every other integration test
// in this suite.
//
// No real Google OAuth credentials exist in this test environment, so the
// syncEnabled cases below exercise the "no active connection found, so
// there's nothing to push to" branch (pushEventCreate/pushEventUpdate/
// pushEventDelete all resolve to a no-op) rather than mocking Google's API
// -- same "don't mock external APIs, test the resilience path" convention
// tests/integration/send-reminders.test.ts already established for this
// codebase.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function createSignedInUser(email: string, password: string) {
  const client = createClient(url, publishableKey);
  await client.auth.signUp({ email, password });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id };
}

describe("push-on-write with no connected calendar", () => {
  it("still creates the event locally when syncEnabled is requested but no calendar is connected", async () => {
    const user = await createSignedInUser(`sync-create-${Date.now()}-${Math.random()}@example.com`, "test-password-123");

    const result = await insertEventCore(user.client, user.userId, {
      title: "Team sync",
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
      syncEnabled: true,
    });

    expect(result.ok).toBe(true);
    const { data: event } = await user.client.from("events").select().eq("id", result.eventId!).single();
    expect(event?.sync_enabled).toBe(true);
    expect(event?.calendar_connection_id).toBeNull();
    expect(event?.external_id).toBeNull();
  });

  it("does not throw when rescheduling a sync-enabled event with no connection to push to", async () => {
    const user = await createSignedInUser(`sync-reschedule-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
    const created = await insertEventCore(user.client, user.userId, {
      title: "Team sync",
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
      syncEnabled: true,
    });

    const newStart = new Date(Date.now() + 86_400_000).toISOString();
    const newEnd = new Date(Date.now() + 90_000_000).toISOString();
    await expect(rescheduleEventCore(user.client, user.userId, created.eventId!, newStart, newEnd)).resolves.not.toThrow();

    const { data: event } = await user.client.from("events").select("start_at").eq("id", created.eventId!).single();
    // Compared by instant, not string equality -- PostgREST serializes
    // timestamptz with a "+00:00" suffix rather than "Z".
    expect(new Date(event!.start_at).getTime()).toBe(new Date(newStart).getTime());
  });

  it("does not throw when deleting a sync-enabled event with no connection to push to", async () => {
    const user = await createSignedInUser(`sync-delete-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
    const created = await insertEventCore(user.client, user.userId, {
      title: "Team sync",
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
      syncEnabled: true,
    });

    await expect(deleteEventCore(user.client, created.eventId!, false)).resolves.not.toThrow();

    const { data: event } = await user.client.from("events").select().eq("id", created.eventId!).maybeSingle();
    expect(event).toBeNull();
  });

  it("leaves plain (non-synced) event creation completely unaffected", async () => {
    const user = await createSignedInUser(`sync-unaffected-${Date.now()}-${Math.random()}@example.com`, "test-password-123");

    const result = await insertEventCore(user.client, user.userId, {
      title: "Plain event",
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    expect(result.ok).toBe(true);
    const { data: event } = await user.client.from("events").select().eq("id", result.eventId!).single();
    expect(event?.sync_enabled).toBe(false);
  });
});

describe("calendar_connections", () => {
  it("getGoogleCalendarConnectionCore returns null when nothing is connected", async () => {
    const user = await createSignedInUser(`conn-none-${Date.now()}-${Math.random()}@example.com`, "test-password-123");
    expect(await getGoogleCalendarConnectionCore(user.client, user.userId)).toBeNull();
  });

  it("disconnecting sets calendar_connection_id to null on previously-synced events rather than deleting them", async () => {
    const user = await createSignedInUser(`conn-disconnect-${Date.now()}-${Math.random()}@example.com`, "test-password-123");

    const { data: connection, error: connectionError } = await user.client
      .from("calendar_connections")
      .insert({
        user_id: user.userId,
        provider: "google",
        access_token_encrypted: "test-encrypted-access",
        refresh_token_encrypted: "test-encrypted-refresh",
        token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select()
      .single();
    if (connectionError || !connection) throw new Error(`seeding connection failed: ${connectionError?.message}`);

    const { data: event, error: eventError } = await user.client
      .from("events")
      .insert({
        user_id: user.userId,
        title: "Synced event",
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 3_600_000).toISOString(),
        sync_enabled: true,
        calendar_connection_id: connection.id,
        external_id: "google-event-123",
      })
      .select("id")
      .single();
    if (eventError || !event) throw new Error(`seeding event failed: ${eventError?.message}`);

    await disconnectGoogleCalendarCore(user.client, user.userId);

    expect(await getGoogleCalendarConnectionCore(user.client, user.userId)).toBeNull();

    const { data: survivingEvent } = await user.client.from("events").select().eq("id", event.id).single();
    expect(survivingEvent).not.toBeNull();
    expect(survivingEvent?.calendar_connection_id).toBeNull();
  });
});
