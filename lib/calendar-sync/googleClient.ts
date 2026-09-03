// Thin wrapper around Google Calendar API v3 + OAuth2 token endpoints, built
// on plain `fetch` rather than Google's Node SDK -- so the same calls can be
// ported to the Deno-based sync-calendars Edge Function (which has no npm
// install step for a Google client library) without a rewrite.
import { TZDate } from "@date-fns/tz";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar";

function clientId(): string {
  const value = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  if (!value) throw new Error("GOOGLE_CALENDAR_CLIENT_ID is not set");
  return value;
}

function clientSecret(): string {
  const value = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!value) throw new Error("GOOGLE_CALENDAR_CLIENT_SECRET is not set");
  return value;
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Forces Google to reissue a refresh token even on repeat consent --
    // without this, a reconnect after a revoked/expired token can silently
    // come back with no refresh token at all.
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export interface GoogleEventInput {
  title: string;
  startAt: string;
  endAt: string;
}

export interface GoogleEventResult {
  id: string;
  updated: string;
}

// startAt/endAt are always full ISO instants with an explicit UTC offset
// (events.start_at/end_at are timestamptz, serialized via toISOString()) --
// Google's API treats an explicit offset in `dateTime` as authoritative, so
// a separate `timeZone` field isn't needed on the way out.
function toGoogleEventBody(event: GoogleEventInput) {
  return {
    summary: event.title,
    start: { dateTime: event.startAt },
    end: { dateTime: event.endAt },
  };
}

export async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: GoogleEventInput
): Promise<GoogleEventResult> {
  const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEventBody(event)),
  });
  if (!res.ok) throw new Error(`Google create event failed: ${await res.text()}`);

  const data = await res.json();
  return { id: data.id, updated: data.updated };
}

export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  externalId: string,
  event: GoogleEventInput
): Promise<GoogleEventResult> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(toGoogleEventBody(event)),
    }
  );
  if (!res.ok) throw new Error(`Google update event failed: ${await res.text()}`);

  const data = await res.json();
  return { id: data.id, updated: data.updated };
}

// A delete of an event Google already doesn't have (404/410 -- e.g. it was
// already removed by a prior sync tick) is treated as success, not an
// error: the end state Jotter wants ("this event is gone from Google") is
// already true.
export async function deleteGoogleEvent(accessToken: string, calendarId: string, externalId: string): Promise<void> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google delete event failed: ${await res.text()}`);
  }
}

export interface RawGoogleEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  updated: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export interface ListEventsResult {
  events: RawGoogleEvent[];
  nextSyncToken: string | null;
}

// Thrown when Google reports the stored sync_token is no longer valid (410
// Gone) -- the caller's response is to fall back to a bounded full resync,
// not to treat this as a hard failure.
export class SyncTokenInvalidError extends Error {}

export async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
  options: { syncToken?: string; timeMin?: string; timeMax?: string }
): Promise<ListEventsResult> {
  const events: RawGoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const params = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "250" });
    // syncToken and timeMin/timeMax are mutually exclusive per Google's API
    // -- an incremental sync's cursor already implies the range.
    if (options.syncToken) {
      params.set("syncToken", options.syncToken);
    } else {
      if (options.timeMin) params.set("timeMin", options.timeMin);
      if (options.timeMax) params.set("timeMax", options.timeMax);
    }
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 410) throw new SyncTokenInvalidError("Google sync token expired");
    if (!res.ok) throw new Error(`Google list events failed: ${await res.text()}`);

    const data = await res.json();
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}

export interface MappedEvent {
  title: string;
  startAt: string;
  endAt: string;
  updatedAt: string;
  cancelled: boolean;
}

// A bare "YYYY-MM-DD" all-day date has no zone of its own -- parsed via
// split + TZDate's numeric-components constructor (same technique
// app/(app)/calendar/page.tsx's parseAnchorDate uses) rather than through a
// naive `new Date(dateStr)`, which would parse ambiently in whichever zone
// the executing runtime happens to be in instead of the given timeZone.
function allDayDateToIso(dateStr: string, timeZone: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new TZDate(year, month - 1, day, timeZone).toISOString();
}

// All-day events (a `date`, not `dateTime`) map to midnight-to-midnight in
// the given timezone -- a stated approximation (per the design spec), not
// full all-day semantics; Jotter's events table has no separate all-day flag.
export function mapGoogleEventToJotterEvent(raw: RawGoogleEvent, timeZone: string): MappedEvent {
  const startAt = raw.start?.dateTime ?? (raw.start?.date ? allDayDateToIso(raw.start.date, timeZone) : new Date().toISOString());
  const endAt = raw.end?.dateTime ?? (raw.end?.date ? allDayDateToIso(raw.end.date, timeZone) : new Date().toISOString());

  return {
    title: raw.summary ?? "(no title)",
    startAt,
    endAt,
    updatedAt: raw.updated,
    cancelled: raw.status === "cancelled",
  };
}
