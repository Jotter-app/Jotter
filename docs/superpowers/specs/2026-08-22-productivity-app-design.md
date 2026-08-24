# Productivity App (Mix-Match) — Design Spec

**Date:** 2026-08-22
**Status:** Approved for planning

## Summary

A web-based productivity app combining three pillars from day one:

1. **Flexible calendar views** (TickTick-style)
2. **Markdown notes organized in a nested folder tree** (Obsidian-style file explorer, not Keep's grid)
3. **Natural-language quick-capture for tasks/reminders** (TickTick-style)

All three pillars are woven together from the start, with a "basic quality-of-life features first" MVP that gets progressively richer.

## Goals

- Ship a working, synced, multi-device app quickly (favor infra that removes setup work)
- Keep the three pillars genuinely interoperable (shared tags, cross-links, unified search) rather than three bolted-together tools
- Reminders must fire even when the app/browser tab is closed
- Data isolation between users must be enforced at the database level, not just in application code

## Non-Goals (for MVP)

- Real-time collaborative editing
- Mobile native apps (web-first; can wrap later)
- Multiple workspaces (see Later/Stretch)
- Calendar sync with external providers (Google/Outlook) — Phase 2

## Architecture

**Frontend:** Next.js (App Router) + TypeScript, deployed on Vercel. React Server Components for data-heavy views (folder tree, calendar); client components for interactive editors (markdown editor, drag-and-drop calendar, quick-add bar).

**Backend:** Supabase provides:
- **Postgres** for all structured data (tasks, events, note metadata, folders, tags)
- **Auth** — email/password + Google OAuth
- **Storage** — available for attachments/images later; note bodies live in Postgres as text for MVP
- **Row-Level Security (RLS)** on every table, scoped to `auth.uid()`, so a bug in application-layer filtering cannot leak another user's data

**Reminder delivery pipeline** (independent of the request/response web app):
- A scheduled job (Supabase Edge Function on a cron trigger, e.g. every minute) queries `reminders` for rows due and unsent
- Delivers via Web Push (service worker registered in-browser) and/or email (Resend)
- Runs server-side so reminders fire with no tab open

**Why this shape:** Supabase removes most infra/auth work so the MVP is buildable fast, while Postgres + RLS scales cleanly as cross-pillar features (linking, unified search, workspaces) are added later.

## Data Model

All tables scoped to `user_id` via RLS.

| Table | Key columns | Notes |
|---|---|---|
| `folders` | `id, user_id, parent_folder_id (nullable, self-referencing), name, created_at` | Arbitrary nesting depth for the Obsidian-style tree |
| `notes` | `id, user_id, folder_id, title, body_markdown, created_at, updated_at` | Body stored as raw markdown, rendered client-side |
| `tasks` | `id, user_id, title, notes, due_at (nullable), priority, recurrence_rule (nullable), parent_task_id (nullable), completed_at (nullable)` | `parent_task_id` supports subtasks (Phase 2) |
| `events` | `id, user_id, title, start_at, end_at, calendar_color, recurrence_rule (nullable)` | Kept separate from `tasks`: events are time-ranges, tasks are due-points |
| `tags` | `id, user_id, name, color` | Shared vocabulary across notes and tasks |
| `taggables` | `(tag_id, taggable_id, taggable_type)` | Join table so both notes and tasks can carry tags |
| `note_links` | `(source_note_id, target_note_id)` | Populated by parsing `[[wikilinks]]` on save (Phase 2) — powers backlinks |
| `task_note_links` | `(task_id, note_id)` | Attach a note to a task (Phase 2) |
| `reminders` | `id, task_id (nullable), event_id (nullable), fire_at, channel (push/email), sent_at (nullable)` | Split from tasks/events so the cron query stays simple and a task/event can later have multiple reminder times |
| `recurrence_exceptions` | `id, parent_task_id (nullable), parent_event_id (nullable), occurrence_date, status (skipped/modified), override_fields (jsonb, nullable)` | One row per edited/skipped occurrence of a recurring task/event (Phase 2) — "every Monday, except skip the 15th" needs this; a bare `recurrence_rule` column only gets you rule expansion for calendar rendering, not per-occurrence edits |

## Feature Scope

### MVP (all three pillars present, basic depth)
- **Tasks/Reminders:** quick-add bar using `chrono-node` for date parsing; priority; due date; Today/Upcoming/Overdue smart lists; complete/edit/delete
- **Calendar:** month + week views; shows events and tasks with due dates; click a day to add an event; drag to reschedule
- **Notes:** nested folder tree (create/rename/move/delete folders and notes); markdown editor with live preview; tags on notes
- **Cross-cutting:** tags shared between notes and tasks; global search across notes + tasks + events
- **Notifications:** push + email delivery pipeline working end-to-end
- **Auth:** email/password + Google sign-in

### Phase 2
- `[[wikilinks]]` + backlinks panel between notes
- Attach note to task (`task_note_links`)
- Recurring tasks/events: RRULE parsing/expansion for calendar rendering, *and* the `recurrence_exceptions` model for editing/deleting single occurrences — scope both together, not just the rule-expansion half; the exceptions model is the bigger lift and is what external-calendar imports (Phase 2 Google/Outlook sync) will also need for recurring events with their own exception dates
- Subtasks/checklists within a task
- Drag-and-drop time-blocking (drag an unscheduled task onto the calendar)
- Calendar sync with Google/Outlook

### Later / Stretch
- Graph view of note links (Obsidian-style)
- Habit-tracking recurrence (streaks)
- Location-based reminders
- Shared/collaborative notes or tasks
- **Multiple separate workspaces**, plus a combined cross-workspace view
  - Fits the existing data model: add a `workspace_id` column to folders/tasks/events and scope queries by it; no rework of MVP schema required

## Error Handling & Edge Cases

- **Reminder delivery failures:** "attempt" is per-reminder, not per-subscription. A push-channel reminder fans out to every push subscription registered for that user; it counts as delivered if *any* subscription accepts it. Email fallback fires only when *all* of a user's subscriptions fail (or none are registered) — a user with two devices shouldn't get a duplicate email just because one browser's subscription expired. Mark `sent_at` once per reminder, after the fan-out (and fallback, if triggered) completes, regardless of outcome, so the cron job doesn't retry into dead subscriptions indefinitely. Log individual subscription failures for later cleanup of stale ones.
- **Quick-add parsing ambiguity:** if `chrono-node` finds no date/time, save as a task with no due date rather than blocking submission.
- **Folder deletion:** deleting a folder with nested contents prompts for confirmation and either cascades or offers "move contents to parent" — never silently orphans notes.
- **Concurrent edits:** last-write-wins with an `updated_at` optimistic check; warn before overwriting a stale write rather than silently discarding changes. No real-time collab in MVP.
- **RLS as the safety net:** every table's RLS policy scopes to `auth.uid()` independent of application-layer filtering.

## Testing Approach

- **Unit tests:** date-parsing edge cases (chrono-node wrapper), recurrence rule expansion, recurrence exceptions (skip/modify a single occurrence), tag/link extraction from markdown
- **Integration tests:** RLS policies (cross-user isolation), reminder cron job (correct due-reminder selection, correct multi-subscription fan-out/fallback behavior, correct `sent_at` marking)
- **E2E tests (Playwright):** sign up → create a nested note → quick-add a natural-language task → drag an event on the calendar → receive a reminder
- Priority: RLS/integration tests rank above UI polish tests — a data-leak bug is far more damaging than a UI glitch

## Open Questions for Implementation Planning

- None blocking — Phase 2/Later items are intentionally deferred, not undecided.
