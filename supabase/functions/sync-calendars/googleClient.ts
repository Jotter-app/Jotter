// Deno-side counterpart to lib/calendar-sync/googleClient.ts -- same plain
// `fetch` calls against the same Google Calendar API v3 endpoints, kept as
// its own copy rather than a shared import across the Node/Deno boundary
// (see supabase/functions/sync-calendars/index.ts's top comment). Trimmed
// to only what the pull-sync job needs: no buildAuthUrl/exchangeCodeForTokens
// (those only ever run inside a Next.js request, in app/api/calendar/google/).
// @date-fns/tz is a pure-JS npm package Deno's npm compat layer loads fine
// (same way send-reminders already pulls in npm:@supabase/supabase-js and
// npm:web-push) -- reused here rather than hand-rolling timezone math, so
// this file's all-day-date handling matches the Node client exactly.
import { TZDate } from "npm:@date-fns/tz@1";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function clientId(): string {
  const value = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
  if (!value) throw new Error("GOOGLE_CALENDAR_CLIENT_ID is not set");
  return value;
}

function clientSecret(): string {
  const value = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
  if (!value) throw new Error("GOOGLE_CALENDAR_CLIENT_SECRET is not set");
  return value;
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
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString() };
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
// Gone) -- the caller's response is to fall back to a bounded full resync.
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

// Same technique as the Node client's allDayDateToIso (and
// app/(app)/calendar/page.tsx's parseAnchorDate): split the bare y-m-d
// string directly rather than parsing it ambiently through `new Date()`,
// then hand the numeric components to TZDate's numeric-components
// constructor, which interprets them as wall-clock time *in* timeZone.
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
