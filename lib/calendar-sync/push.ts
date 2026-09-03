// Push-on-write: called from lib/actions/events.ts's core insert/reschedule/
// delete functions, right after their local Postgres write already
// succeeded. Best-effort and non-blocking throughout -- a Google failure
// here is never allowed to roll back or block the Jotter-side write that
// triggered it. A failure marks the connection status='error' with
// last_error, which the next pull-cron tick (or a manual "Sync now")
// surfaces and retries -- see supabase/functions/sync-calendars.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getGoogleCalendarConnectionCore } from "@/lib/actions/calendarConnections";
import { createGoogleEvent, deleteGoogleEvent, refreshAccessToken, updateGoogleEvent } from "@/lib/calendar-sync/googleClient";
import { decryptToken, encryptToken } from "@/lib/calendar-sync/tokenCrypto";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

type CalendarConnection = Database["public"]["Tables"]["calendar_connections"]["Row"];
type EventInput = { title: string; startAt: string; endAt: string };

async function getValidAccessToken(supabase: SupabaseClient<Database>, connection: CalendarConnection): Promise<string> {
  const key = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY!;
  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return decryptToken(connection.access_token_encrypted, key);
  }

  const refreshToken = await decryptToken(connection.refresh_token_encrypted, key);
  const refreshed = await refreshAccessToken(refreshToken);
  await supabase
    .from("calendar_connections")
    .update({
      access_token_encrypted: await encryptToken(refreshed.accessToken, key),
      token_expires_at: refreshed.expiresAt,
    })
    .eq("id", connection.id);

  return refreshed.accessToken;
}

async function markConnectionError(supabase: SupabaseClient<Database>, connectionId: string, err: unknown) {
  await supabase
    .from("calendar_connections")
    .update({ status: "error", last_error: err instanceof Error ? err.message : String(err) })
    .eq("id", connectionId);
}

// update/delete already know which connection an event belongs to (its own
// calendar_connection_id) -- looked up directly by id rather than by
// userId+provider (RLS still scopes this to rows the caller's client can
// see, i.e. only ever the current user's own connection).
async function getConnectionById(supabase: SupabaseClient<Database>, connectionId: string): Promise<CalendarConnection | null> {
  const { data } = await supabase.from("calendar_connections").select().eq("id", connectionId).maybeSingle();
  return data ?? null;
}

// Returns null only when there's no active connection to push to at all
// (nothing for the caller to record). When a connection exists but the
// Google call itself fails, externalId comes back null but connectionId is
// still returned -- the caller stamps calendar_connection_id on the event
// row regardless, so the next pull-cron tick can find and retry this
// not-yet-pushed event (it queries by calendar_connection_id + sync_enabled
// + external_id is null).
export async function pushEventCreate(
  supabase: SupabaseClient<Database>,
  userId: string,
  event: EventInput
): Promise<{ connectionId: string; externalId: string | null } | null> {
  const connection = await getGoogleCalendarConnectionCore(supabase, userId);
  if (!connection || connection.status !== "active") return null;

  try {
    const accessToken = await getValidAccessToken(supabase, connection);
    const result = await createGoogleEvent(accessToken, connection.google_calendar_id, event);
    return { connectionId: connection.id, externalId: result.id };
  } catch (err) {
    await markConnectionError(supabase, connection.id, err);
    return { connectionId: connection.id, externalId: null };
  }
}

export async function pushEventUpdate(
  supabase: SupabaseClient<Database>,
  connectionId: string,
  externalId: string,
  event: EventInput
): Promise<void> {
  const connection = await getConnectionById(supabase, connectionId);
  if (!connection || connection.status !== "active") return;

  try {
    const accessToken = await getValidAccessToken(supabase, connection);
    await updateGoogleEvent(accessToken, connection.google_calendar_id, externalId, event);
  } catch (err) {
    await markConnectionError(supabase, connection.id, err);
  }
}

export async function pushEventDelete(
  supabase: SupabaseClient<Database>,
  connectionId: string,
  externalId: string
): Promise<void> {
  const connection = await getConnectionById(supabase, connectionId);
  if (!connection || connection.status !== "active") return;

  try {
    const accessToken = await getValidAccessToken(supabase, connection);
    await deleteGoogleEvent(accessToken, connection.google_calendar_id, externalId);
  } catch (err) {
    await markConnectionError(supabase, connection.id, err);
  }
}
