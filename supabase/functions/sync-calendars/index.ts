// Cron-triggered Edge Function (every 5 minutes, per
// schedule_sync_calendars.sql) -- also invoked directly, scoped to one
// connection via ?connectionId=, by the app's own "Sync now" action
// (lib/actions/calendarConnections.ts's triggerSyncNowCore). Per
// connection: retries any local event a prior push-on-write attempt failed
// to send to Google, then pulls Google's own changes (creates/edits/
// cancellations) into Jotter. One connection's failure (auth, rate limit,
// etc.) marks that connection status='error' and moves on to the next --
// same "one item's failure never blocks the rest, always record an
// outcome" idiom as supabase/functions/send-reminders.
//
// Deliberately has zero imports from lib/ (the Next.js app's code) -- same
// self-containment send-reminders already has. Where logic needs to exist
// in both runtimes (token encrypt/decrypt, the Google API calls, the
// Google-event field mapper), this function carries its own copy rather
// than sharing a module across the Node/Deno boundary; see tokenCrypto.ts
// and googleClient.ts in this same directory.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptToken, encryptToken } from "./tokenCrypto.ts";
import {
  createGoogleEvent,
  listGoogleEvents,
  mapGoogleEventToJotterEvent,
  refreshAccessToken,
  updateGoogleEvent,
  SyncTokenInvalidError,
  type RawGoogleEvent,
} from "./googleClient.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY")!;
const TOKEN_ENCRYPTION_KEY = Deno.env.get("CALENDAR_TOKEN_ENCRYPTION_KEY")!;

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
// No per-request user timezone is available in a background cron job (the
// app's own timezone comes from a cookie TimeZoneProvider writes
// client-side) -- all-day events fall back to UTC. This compounds the
// existing all-day-mapping approximation (per the design spec) rather than
// introducing a new one.
const ALL_DAY_TIME_ZONE = "UTC";
const FULL_SYNC_WINDOW_PAST_MS = 90 * 24 * 60 * 60 * 1000; // ~3 months
const FULL_SYNC_WINDOW_FUTURE_MS = 365 * 24 * 60 * 60 * 1000; // 12 months

interface CalendarConnection {
  id: string;
  user_id: string;
  google_calendar_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
  sync_token: string | null;
}

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const connectionId = new URL(req.url).searchParams.get("connectionId");

  let query = supabase.from("calendar_connections").select().eq("status", "active");
  if (connectionId) query = query.eq("id", connectionId);
  const { data: connections, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results = [];
  for (const connection of (connections ?? []) as CalendarConnection[]) {
    results.push(await processConnection(supabase, connection));
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function processConnection(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  connection: CalendarConnection
) {
  try {
    const accessToken = await getValidAccessToken(supabase, connection);

    await retryFailedPushes(supabase, connection, accessToken);
    const syncToken = await pullChanges(supabase, connection, accessToken);

    await supabase
      .from("calendar_connections")
      .update({ sync_token: syncToken, last_synced_at: new Date().toISOString(), status: "active", last_error: null })
      .eq("id", connection.id);

    return { id: connection.id, ok: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("calendar_connections").update({ status: "error", last_error: message }).eq("id", connection.id);
    return { id: connection.id, ok: false, error: message };
  }
}

async function getValidAccessToken(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  connection: CalendarConnection
): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return decryptToken(connection.access_token_encrypted, TOKEN_ENCRYPTION_KEY);
  }

  const refreshToken = await decryptToken(connection.refresh_token_encrypted, TOKEN_ENCRYPTION_KEY);
  const refreshed = await refreshAccessToken(refreshToken);
  await supabase
    .from("calendar_connections")
    .update({
      access_token_encrypted: await encryptToken(refreshed.accessToken, TOKEN_ENCRYPTION_KEY),
      token_expires_at: refreshed.expiresAt,
    })
    .eq("id", connection.id);

  return refreshed.accessToken;
}

// Local events flagged sync_enabled but never successfully created on
// Google's side (a prior push-on-write attempt failed) -- retried here,
// since the pull tick is this design's retry mechanism for failed pushes
// (see the design spec's Conflict Resolution section).
async function retryFailedPushes(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  connection: CalendarConnection,
  accessToken: string
) {
  const { data: pending } = await supabase
    .from("events")
    .select("id, title, start_at, end_at")
    .eq("calendar_connection_id", connection.id)
    .eq("sync_enabled", true)
    .is("external_id", null);

  for (const event of pending ?? []) {
    try {
      const result = await createGoogleEvent(accessToken, connection.google_calendar_id, {
        title: event.title,
        startAt: event.start_at,
        endAt: event.end_at,
      });
      await supabase.from("events").update({ external_id: result.id }).eq("id", event.id);
    } catch {
      // Leave it for the next tick -- one event's push failure shouldn't
      // abort the rest of this connection's sync.
    }
  }
}

async function pullChanges(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  connection: CalendarConnection,
  accessToken: string
): Promise<string | null> {
  const boundedFullSyncWindow = () => {
    const now = Date.now();
    return {
      timeMin: new Date(now - FULL_SYNC_WINDOW_PAST_MS).toISOString(),
      timeMax: new Date(now + FULL_SYNC_WINDOW_FUTURE_MS).toISOString(),
    };
  };

  let listResult;
  if (connection.sync_token) {
    try {
      listResult = await listGoogleEvents(accessToken, connection.google_calendar_id, { syncToken: connection.sync_token });
    } catch (err) {
      if (!(err instanceof SyncTokenInvalidError)) throw err;
      // Google invalidated the old cursor -- fall back to a bounded full
      // resync rather than treating this as a hard failure.
      listResult = await listGoogleEvents(accessToken, connection.google_calendar_id, boundedFullSyncWindow());
    }
  } else {
    // No sync_token yet (first sync ever). Omitting timeMin/timeMax
    // entirely here -- rather than only setting them in the catch branch
    // above -- would ask Google for *every event on the calendar since it
    // was created*, unbounded; found this the hard way testing against a
    // real account, where it hung for minutes fetching years of expanded
    // recurring-event instances instead of erroring.
    listResult = await listGoogleEvents(accessToken, connection.google_calendar_id, boundedFullSyncWindow());
  }

  for (const raw of listResult.events) {
    await applyGoogleEvent(supabase, connection, accessToken, raw);
  }

  return listResult.nextSyncToken;
}

async function applyGoogleEvent(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  connection: CalendarConnection,
  accessToken: string,
  raw: RawGoogleEvent
) {
  const mapped = mapGoogleEventToJotterEvent(raw, ALL_DAY_TIME_ZONE);

  const { data: existing } = await supabase
    .from("events")
    .select("id, title, start_at, end_at, updated_at")
    .eq("calendar_connection_id", connection.id)
    .eq("external_id", raw.id)
    .maybeSingle();

  if (mapped.cancelled) {
    if (existing) {
      // Matches deleteEventCore's "keep task standalone" default -- a
      // synced event's linked task, if any, was added manually by the
      // user, not auto-created, so a Google-side cancellation shouldn't
      // silently take a manually-linked task down with it.
      await supabase.from("events").delete().eq("id", existing.id);
    }
    return;
  }

  if (!existing) {
    await supabase.from("events").insert({
      user_id: connection.user_id,
      title: mapped.title,
      start_at: mapped.startAt,
      end_at: mapped.endAt,
      sync_enabled: true,
      calendar_connection_id: connection.id,
      external_id: raw.id,
    });
    return;
  }

  // "Most-recent-edit-wins," concretely: push-on-write already keeps the
  // two sides in lockstep on the success path, so the local row being at
  // least as recent as Google's own `updated` means an earlier push
  // attempt must have failed -- the fix is to retry that push, not accept
  // Google's now-stale data. See the design spec's Conflict Resolution
  // section (lib/calendar-sync/resolveConflict.ts is this exact comparison
  // on the Node side, kept inline here rather than shared across the
  // Node/Deno boundary).
  const googleIsNewer = new Date(mapped.updatedAt).getTime() > new Date(existing.updated_at).getTime();
  if (googleIsNewer) {
    await supabase
      .from("events")
      .update({ title: mapped.title, start_at: mapped.startAt, end_at: mapped.endAt })
      .eq("id", existing.id);
    return;
  }

  try {
    await updateGoogleEvent(accessToken, connection.google_calendar_id, raw.id, {
      title: existing.title,
      startAt: existing.start_at,
      endAt: existing.end_at,
    });
  } catch {
    // Leave it for the next tick.
  }
}
