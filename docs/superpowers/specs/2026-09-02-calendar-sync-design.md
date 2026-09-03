# Google Calendar Sync — Design Spec

**Date:** 2026-09-02
**Status:** Approved for planning

## Summary

The first build item on the Jotter sale-prep "Keep" list: two-way sync between a user's Google Calendar (primary calendar only) and Jotter's own calendar. Jotter-initiated changes push to Google immediately from the same server actions that already write to `events`; Google-initiated changes are picked up by a polling cron job, reusing the existing reminders pipeline's Edge Function + `pg_cron` pattern. Recurring events are handled by letting Google do the recurrence expansion (`singleEvents=true`) rather than teaching Jotter's own, deliberately-minimal recurrence engine (see [2026-08-28-recurring-events-and-meeting-thread-design.md](2026-08-28-recurring-events-and-meeting-thread-design.md)) about exceptions it doesn't have.

## Goals

- A user can connect their Google account once, from Settings, and see their primary Google Calendar's events alongside Jotter's own on the calendar view.
- Creating an event in Jotter with "Sync to Google Calendar" checked shows up in Google within seconds.
- An event created, edited, or deleted directly in Google Calendar (web, mobile, any client) shows up in Jotter within a few minutes, without the user doing anything.
- Recurring Google events (including ones with per-occurrence edits/cancellations) render correctly in Jotter without Jotter needing its own exceptions model.
- Disconnecting Google leaves every previously-synced event intact as an ordinary Jotter event — nothing is bulk-deleted.

## Non-Goals

- **No Outlook/Microsoft 365, iCloud/CalDAV, or any provider besides Google.** Google alone is the highest-value, most-requested integration; adding a second provider before the first is proven with real testers would double the OAuth/token/API-quirk surface for no validated benefit.
- **No multi-calendar picker, no multiple connected Google accounts.** One user, one Google account, one calendar (`primary`). A `unique(user_id, provider)` constraint enforces this at the schema level. Extending to a calendar picker is a natural fast-follow once this is proven, not a v1 concern.
- **No push notifications / webhook channels.** Google→Jotter sync is polling-only (a 5-minute cron tick). This trades a few minutes of latency for not having to stand up, verify, and renew a public webhook endpoint — infrastructure this app has nowhere else.
- **No manual conflict-resolution UI.** Conflicts (same event edited on both sides between polls) resolve automatically to whichever side was edited more recently, silently. No conflict inbox, no side-by-side diff.
- **No "edit this occurrence vs. all future occurrences."** This doesn't exist for Jotter's own native recurring events either (per the recurring-events spec) — not a new gap, just not a closed one.
- **No way to enable sync on a pre-existing event.** Jotter has no general event-edit UI at all today (only drag-reschedule and delete). The "Sync to Google Calendar" checkbox only exists at creation time in `AddEventDialog`. Turning on sync for an event created before this feature (or created with the box unchecked) means deleting and recreating it — the same limitation every other event field already has.
- **No cross-wiring with Jotter's native recurrence engine.** Google-sourced recurring instances are plain `events` rows with `series_id`/`recurrence_rule` left null. Jotter's own recurrence system and Google's never interact; each event is either "Jotter-native, possibly part of a Jotter series" or "Google-synced, possibly one of many flat instances Google already expanded," never both.

## Prerequisites (account setup, not code)

A Google Cloud Console project with the Calendar API enabled, an OAuth consent screen configured, and an OAuth client (Web application type) with the callback URL registered — separate from whatever OAuth client backs the existing "Continue with Google" **sign-in** button (`components/auth/GoogleSignInButton.tsx`), since that flow's tokens are managed by Supabase Auth and aren't exposed to application code for ongoing background API calls. This is the same category of external setup as Resend's domain verification — the user's own action, not something implementation can do.

New env vars (added to `.env.example`):
```
# Google Calendar sync (Google Cloud Console -> APIs & Services -> Credentials)
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
# Server-only -- 32-byte key (base64) for encrypting stored OAuth tokens. Generate with:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CALENDAR_TOKEN_ENCRYPTION_KEY=
```

## Data Model

**New migration — `calendar_connections`:**
```sql
create table calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  google_calendar_id text not null default 'primary',
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  token_expires_at timestamptz not null,
  sync_token text,                          -- Google's incremental-sync cursor; null means "needs a full resync"
  status text not null default 'active',    -- 'active' | 'error' | 'disconnected'
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint calendar_connections_one_per_provider unique (user_id, provider)
);

alter table calendar_connections enable row level security;

create policy "calendar_connections_owner_all" on calendar_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**New migration — `events` sync columns:**
```sql
alter table events add column sync_enabled boolean not null default false;
alter table events add column external_id text;
alter table events add column calendar_connection_id uuid references calendar_connections(id) on delete set null;

-- A connection can't have two Jotter rows claiming the same Google event.
create unique index events_external_id_idx on events (calendar_connection_id, external_id) where external_id is not null;
```
`on delete set null` for `calendar_connection_id` matches the existing pattern for `series_id` / `linked_task_id` / `linked_note_id`: when the thing an event points at goes away, the event survives as a plain standalone row rather than cascading.

**Token encryption:** application-level AES-256-GCM (Node's `crypto` module) keyed by `CALENDAR_TOKEN_ENCRYPTION_KEY`, encrypted/decrypted in a new `lib/calendar-sync/tokenCrypto.ts`. Consistent with how every other secret in this app is handled (a server-only env var), rather than introducing a Postgres extension (pgsodium/Vault) this project doesn't otherwise use.

## OAuth & Connection Flow

Two new route handlers, under `app/api/calendar/google/`:

- **`GET /api/calendar/google/connect`** — builds the Google authorization URL with `scope=https://www.googleapis.com/auth/calendar`, `access_type=offline`, `prompt=consent` (forces Google to reissue a refresh token even if the user has consented before — without this, a re-connect after a revoked/expired token can silently come back with no refresh token at all), and a CSRF `state` value tied to the user's session. Redirects the browser there.
- **`GET /api/calendar/google/callback`** — receives `code`, exchanges it for an access + refresh token, calls Google's calendar API to confirm `'primary'` resolves, encrypts both tokens, and upserts the `calendar_connections` row (`on conflict (user_id, provider) do update` — reconnecting after a revoke replaces the old row's tokens rather than erroring on the unique constraint). Redirects to `/settings`.

## Push Sync (Jotter → Google, on write)

`lib/actions/events.ts` gains a post-write step in `insertEventCore`, and the update/delete paths: when an event has `sync_enabled = true`, call a new `lib/calendar-sync/googleClient.ts` (`createGoogleEvent` / `updateGoogleEvent` / `deleteGoogleEvent`) after the Postgres write has already succeeded — refreshing the stored access token first if it's within a short buffer of `token_expires_at`.

**Best-effort, non-blocking:** the Jotter-side write is never rolled back because a Google call failed. A failure sets `calendar_connections.status = 'error'` and `last_error`, surfaced in Settings; the next successful pull-cron tick (or a manual "Sync now") reconciles it. This keeps the core product (task/note/event CRUD) from ever depending on a third-party API being up.

`components/calendar/AddEventDialog.tsx` gains a "Sync to Google Calendar" checkbox next to the existing "Also add as a task" one — rendered only when an active `calendar_connections` row exists for the user, **default unchecked** (opt-in per event, matching the existing checkbox pattern rather than syncing everything automatically).

## Pull Sync (Google → Jotter, cron)

New Supabase Edge Function `sync-calendars`, scheduled every 5 minutes via `pg_cron` — same shape as `schedule_send_reminders.sql`. For each `calendar_connections` row with `status = 'active'`:

1. Refresh the access token if it's within the expiry buffer.
2. Call `events.list` on `google_calendar_id`, passing the stored `sync_token` for an incremental diff. If there's no `sync_token` (first sync, or Google invalidated it with a 410), do a full sync bounded to a window — 3 months back, 12 months forward — matching the bounded-window approach Jotter's own virtual-occurrence expansion already uses for recurring events. Always pass `singleEvents=true` (Google expands recurring series into concrete instances, so Jotter never parses RRULE/EXDATE for synced events) and `showDeleted=true` (so cancellations show up in the incremental diff).
3. For each returned Google event:
   - `status: 'cancelled'` → if a Jotter row exists for that `external_id`, delete it through the same core delete path `EventDeleteDialog` uses, so linked-task/note cleanup behaves identically to a manual delete.
   - Unknown `external_id` → insert a new `events` row (`sync_enabled = true`, `calendar_connection_id`, `external_id`, times converted via `@date-fns/tz` using the event's own `timeZone`, not naive `Date` parsing).
   - Known `external_id` → **conflict resolution** (below).
4. Store the response's new `sync_token`, set `last_synced_at = now()`, `status = 'active'`. On any request failure, set `status = 'error'` with `last_error` and leave `sync_token` untouched so the next tick retries from the same cursor.

### Conflict Resolution

"Most-recent-edit-wins," made concrete: compare Google's `updated` timestamp for the event against Jotter's `events.updated_at`.

- **Google's is newer** → overwrite the local row's fields from Google's data. This is the common case: something changed on the Google side since the last successful sync.
- **Jotter's is newer** → re-push the local event to Google instead of applying the (now-stale) pulled data. Because push-on-write already syncs the two sides immediately on every successful local write, the *only* way Jotter's `updated_at` ends up ahead of what a fresh pull just reported is that an earlier push attempt failed (network blip, expired token at the time). The pull tick effectively becomes the retry mechanism for failed pushes — no separate retry queue needed.

There's no dedicated "last known Google state" bookkeeping column; comparing the two current timestamps at pull time is sufficient specifically because push-on-write keeps them in lockstep on the success path.

## Recurring Events

Google's `singleEvents=true` does all the recurrence math — Jotter receives a flat list of concrete instances, each with its own `id` (used as `external_id`) and its own `updated` timestamp. Each instance becomes its own ordinary `events` row: `series_id` and `recurrence_rule` are left null, since these are Google's concept, not Jotter's. A single-occurrence edit or cancellation in Google shows up as an updated or `cancelled` entry for that one instance in the next incremental diff, handled exactly like any other update/delete — no special-casing needed.

This means Jotter's native recurrence engine (Daily/Weekly/Monthly dropdown, virtual occurrences, `RecurringOccurrenceChip`) and Google-synced recurring events are two entirely separate code paths that never call into each other.

## UI

- **Settings** (`app/(app)/settings/page.tsx`) — new `components/settings/GoogleCalendarConnection.tsx`:
  - No connection: a "Connect Google Calendar" button (links to `/api/calendar/google/connect`).
  - Active connection: connected account email, "Last synced <relative time>", a "Sync now" button (manually triggers one pull-cron pass for just this connection), and "Disconnect".
  - `status = 'error'`: the error message plus a "Reconnect" prompt — same retry-path pattern as the recent "Enable reminders" permanently-hiding-its-retry-path fix, i.e. an error state must never be a dead end.
- **Calendar view** (`components/calendar/EventChip.tsx`) — a small synced-calendar badge/icon on any event with `calendar_connection_id` set, so it's visually clear at a glance which events are Google-linked vs. Jotter-native.

## Error Handling & Edge Cases

- **Refresh token revoked** (user revokes access in their Google account settings): the next push or pull call fails with an auth error → `status = 'error'`, surfaced in Settings; fixed by reconnecting, which overwrites the connection row via the callback's upsert.
- **Rate limiting** (Google Calendar API quota): exponential backoff on 429/403 in both the push path (server actions) and the pull cron; a push failure never blocks the user's local save.
- **All-day / multi-day events**: Google represents these with a `date` (no time) instead of `dateTime`. Jotter's schema only has `timestamptz` columns, so v1 maps an all-day event to midnight-to-midnight in the user's timezone — a stated approximation, not full all-day semantics (no distinct "all-day" flag or rendering row).
- **Disconnect**: `calendar_connections` row deleted; every event that referenced it gets `calendar_connection_id = null` and `sync_enabled = false` via the FK, staying in Jotter as ordinary events. Nothing is bulk-deleted.
- **`sync_token` invalidated by Google** (410 response, e.g. after a long outage): treated the same as "no sync_token" — falls back to the bounded full resync window.
- **Duplicate push/delete races** (e.g. an event deleted in Jotter right as a pull tick is processing the same event): the unique index on `(calendar_connection_id, external_id)` prevents a duplicate insert; a delete call to an already-deleted Google event returns 404/410, treated as success.

## Testing Approach

- **Unit tests**: `tokenCrypto` round-trip (encrypt/decrypt), the conflict-resolution comparator (Google-newer / Jotter-newer / equal-timestamp cases), and the Google-event → Jotter-event field mapper (including the all-day-to-timestamptz conversion) — all pure functions tested against fixture JSON, no real network calls.
- **Integration tests**: push-on-write and the pull-sync function against a mocked Google Calendar API (fetch mock), verifying RLS scoping on `calendar_connections` and the `events_external_id_idx` uniqueness constraint.
- **Manual verification** (real Google test account required): connect an account; create a Jotter event with sync checked and confirm it appears in Google within seconds; edit that event in Google Calendar directly, wait for a poll tick (or use "Sync now"), confirm the edit lands in Jotter; delete it in Google, confirm it disappears from Jotter; create a weekly recurring event in Google and confirm each occurrence renders as its own event in Jotter; disconnect and confirm previously-synced events remain untouched.
- Full existing suite must stay green.
