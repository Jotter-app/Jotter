# Meeting Notes, Post-Meeting Debrief, Tag Dashboards, and Daily/Weekly Reviews — Design Spec

**Date:** 2026-08-28
**Status:** Approved for planning

## Summary

Tier 3 of the cross-pillar interconnectivity roadmap. Five features, gated behind one small schema addition (`events.linked_note_id`, mirroring the existing `events.linked_task_id`) and one small schema widening (`taggables.taggable_type` gains `'event'`):

1. **Meeting-note generation** — a button on an event's popover creates a note, links it back via `linked_note_id`, and opens it.
2. **Post-meeting debrief** — once an event has a linked note, a push notification fires when the event ends, opening straight to that note. Rides the existing reminders pipeline end-to-end.
3. **Tag dashboards** — `/tags` lists every tag; `/tags/[tagId]` shows every note, task, and event carrying it. Requires event-tagging, which is new UI (nothing tags events today).
4. **Daily note** — a "Today's Note" link gets-or-creates a note in a `Daily Notes` folder, pre-filled with live `?tasks due:today` / `?events due:today` embedded queries (extending Tier 2's query engine to a third pillar) plus a blank journal section.
5. **Weekly review** — a "This Week" link gets-or-creates a note in a `Weekly Reviews` folder. Its retrospective sections (completed tasks, touched notes) are a static snapshot baked in at generation time; only its forward-looking section (`?tasks due:week`) is a live embedded query.

## Goals

- An event can carry real notes, and following up on it (via a note or a nudge after it ends) takes no manual linking.
- A tag becomes a real destination — click through and see everything carrying it, across all three pillars.
- Two recurring note-writing habits (a daily log, a weekly retro) are one click to start, not a blank page and a memory of what to include.

## Non-Goals

- **No recurring-meeting thread.** Linking each occurrence of a recurring event to a running note that references the prior one needs RRULE expansion + `recurrence_exceptions`, neither of which exist yet (confirmed: no `rrule` library installed, no expansion code anywhere in `lib/`). Out of scope until that ships.
- **No settings toggle for the debrief notification.** It's opt-in by construction: a debrief reminder is only ever created for an event that already has a linked note (i.e., you used meeting-note generation on it), not for every event on the calendar. No separate on/off switch needed.
- **`due:`/`status:` still don't apply to notes, and now `status:` doesn't apply to events either.** The embedded-query engine's `?events` pillar only supports `#tag` and `due:today` (an event "happening today," by `start_at`) — no `overdue`/`week` for events, no `status:` (an event has no open/done concept). Extending further is deferred until a real use case asks for it.
- **No deep link to a specific day on `/calendar`.** Event rows in an embedded `?events` query render as plain, non-clickable text (title + time) rather than a link — there's no per-event page and no confirmed `?date=` query param on the calendar route to link to safely.
- **The weekly review's retrospective sections are static, not live.** "Completed this week" and "notes touched this week" are markdown baked in once at generation time, not embedded query lines — see Part 5 for why a live query is the wrong shape for a backward-looking snapshot.
- **No tag-page link from every tag pill in the app.** Only pills with no existing click behavior gain a link to their `/tags/[tagId]` dashboard (`NoteTagsSection`'s, and the new `/tags` index). `TagFilterRow`'s pills on the Tasks page keep their existing click-to-filter-in-place behavior unchanged — repurposing that would be a regression, not an addition.

## Part 1 — Meeting-Note Generation

### Design

**New migration** (mirrors `20260823191313_events_linked_task_id.sql` exactly):
```sql
alter table events add column linked_note_id uuid references notes(id) on delete set null;
create index events_linked_note_idx on events (linked_note_id) where linked_note_id is not null;
```

**`lib/actions/events.ts`** gains:
```ts
export async function generateMeetingNoteCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string
): Promise<{ ok: boolean; noteId: string | null }> {
  const { data: event } = await supabase
    .from("events")
    .select("title, start_at, end_at, linked_note_id")
    .eq("id", eventId)
    .single();
  if (!event) return { ok: false, noteId: null };
  if (event.linked_note_id) return { ok: true, noteId: event.linked_note_id }; // idempotent -- re-clicking opens the same note

  const range = `${format(new Date(event.start_at), "MMM d, yyyy · h:mm a")}–${format(new Date(event.end_at), "h:mm a")}`;
  const result = await insertNoteCore(supabase, userId, { folderId: null, title: event.title, bodyMarkdown: `**${range}**\n\n` });
  if (!result.ok || !result.noteId) return { ok: false, noteId: null };

  await supabase.from("events").update({ linked_note_id: result.noteId }).eq("id", eventId);
  await syncEventDebriefReminder(supabase, userId, eventId, event.end_at); // Part 2
  return { ok: true, noteId: result.noteId };
}

export async function generateMeetingNote(eventId: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, noteId: null };
  const result = await generateMeetingNoteCore(supabase, userId, eventId);
  if (result.ok) revalidatePath("/calendar");
  return result;
}
```
Unfiled (`folderId: null`), same as `createNoteFromWikilink` — no assumption about folder structure, reachable from `/notes`'s root listing and from the event itself.

Tasks captured *inside* that note (via line-to-task, `/task create`, or date-detection — all three already exist from Tier 2) link back through the existing `task_note_links` table, same as any other note. No new event↔task plumbing needed: the chain is event → note (`linked_note_id`) → tasks (`task_note_links`), and that's enough to trace "tasks that came out of this meeting" without writing anything into `events.linked_task_id`, which stays reserved for the one "this event is also a task" companion relationship it already has.

**`components/calendar/EventChip.tsx`**: the popover gains a row below the time range — `Link href="/notes/{linked_note_id}"` labeled with the note's title when `linked_note_id` is set, or a "Generate note" button (calls `generateMeetingNote`, then navigates to the returned `noteId`) when it isn't. The page fetching `EventChip`'s data widens its `events` select to include `linked_note_id`.

### Error Handling & Edge Cases

- Clicking "Generate note" twice in quick succession: the second call sees `linked_note_id` already set (once the first completes) and returns the existing note rather than creating a duplicate — same idempotent-by-construction shape as `linkTaskNoteCore`'s upsert.
- Deleting the linked note: `on delete set null` clears `events.linked_note_id` automatically — the event reverts to showing "Generate note" again, and `syncEventDebriefReminder` (Part 2) needs to be told about this too (see Part 2's edge cases).
- Deleting the event: no explicit cleanup needed for the note — it's a normal note, untouched by the event's deletion (the FK only clears the *event's* pointer via `on delete set null` on `events`, not the reverse).

### Testing Approach

- **Unit tests**: none new — this part is a straightforward core/wrapper action pair, same shape as `insertEventCore`/`linkTaskNoteCore`, which are already covered.
- **Manual verification**: create an event, generate its note, confirm the event's popover now links to it; add a `/task create` line inside that note and confirm the task is linked to the note (not the event); delete the note and confirm the event's popover reverts to "Generate note."
- Full existing suite must stay green.

## Part 2 — Post-Meeting Debrief

### Design

**`lib/reminders/syncEventDebriefReminder.ts`** (new — mirrors `syncTaskReminder.ts`'s exact shape):
```ts
export async function syncEventDebriefReminder(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  debriefAt: string | null // null = no linked note, no debrief
) {
  const { data: existing } = await supabase
    .from("reminders")
    .select("id")
    .eq("event_id", eventId)
    .is("sent_at", null)
    .maybeSingle();

  if (!debriefAt) {
    if (existing) await supabase.from("reminders").delete().eq("id", existing.id);
    return;
  }

  if (existing) {
    await supabase.from("reminders").update({ fire_at: debriefAt }).eq("id", existing.id);
  } else {
    await supabase.from("reminders").insert({ user_id: userId, event_id: eventId, fire_at: debriefAt, channel: "push" });
  }
}
```
`reminders.event_id` already exists and the delivery pipeline (`supabase/functions/send-reminders/index.ts`) already has a full `event_id` branch — it's simply never been populated by any code path today, since nothing creates an event reminder. This reuses that dormant capacity rather than adding a new reminder "kind": every `event_id` reminder going forward *is* a debrief (fired at `end_at`, not `start_at`), since a start-time reminder was never wired up in the first place.

**Call sites**:
- `generateMeetingNoteCore` (Part 1): after setting `linked_note_id`, calls `syncEventDebriefReminder(supabase, userId, eventId, event.end_at)`.
- `rescheduleEventCore` (existing, in `lib/actions/events.ts`): already re-syncs the linked task's due date on reschedule; gains one more line — if the event has a `linked_note_id`, also call `syncEventDebriefReminder(supabase, userId, eventId, newEndAt)` so the debrief moves with the event.
- Deleting the event: no explicit cleanup — `reminders.event_id references events(id) on delete cascade` already removes it.
- Deleting the *linked note* (Part 1's edge case): `syncEventDebriefReminder(supabase, userId, eventId, null)` needs to run here too, in whatever code path clears `linked_note_id` — since notes don't currently know about `events.linked_note_id` pointing at them, this means `deleteNote` needs to look up any event with `linked_note_id = noteId` and clear its debrief reminder before/alongside the delete. A small addition to `lib/actions/notes.ts`'s `deleteNote`.

**`supabase/functions/send-reminders/index.ts`**: the existing `event_id` branch's message copy and destination change —
```ts
} else if (reminder.event_id) {
  const { data: event } = await supabase.from("events").select("title, linked_note_id").eq("id", reminder.event_id).maybeSingle();
  title = event?.title ? `Add notes? ${event.title}` : "Meeting ended";
  url = event?.linked_note_id ? `/notes/${event.linked_note_id}` : "/calendar";
}
```
The `/calendar` fallback only matters for the (rare, timing-dependent) case where the note was deleted after the reminder fired but the row hadn't been cleaned up yet — everyday behavior always has `linked_note_id` set, since that's the only path that creates the reminder at all.

### Error Handling & Edge Cases

- Event rescheduled after its debrief reminder already fired (`sent_at` is set): `syncEventDebriefReminder`'s `.is("sent_at", null)` lookup finds nothing, so a *new* reminder is inserted for the new end time — same "don't resurrect an already-delivered reminder" behavior `syncTaskReminder` already has.
- No push subscription and no `RESEND_API_KEY` configured: the reminder is still marked `sent_at` with a `last_error` explaining why, exactly like every other reminder today — no special handling needed, this falls out of the existing Edge Function unchanged.
- Multiple debrief reminders never stack: the `.maybeSingle()` existing-row lookup plus update-in-place (not insert-a-second-row) keeps it to one unsent reminder per event, same invariant `syncTaskReminder` maintains per task.

### Testing Approach

- **Unit tests**: `syncEventDebriefReminder`'s core logic is thin enough to cover via the same integration-test shape `syncTaskReminder` presumably already has (create → reschedule → clear), not new pure-function unit tests.
- **Manual verification**: generate a meeting note for an event ending a minute from now, wait for the cron tick, confirm a push notification arrives titled "Add notes? {title}" and opens the linked note; reschedule the event before it fires and confirm the reminder moves with it; delete the linked note and confirm no notification arrives.
- Full existing suite must stay green.

## Part 3 — Tag Dashboards

### Design

**New migration**:
```sql
alter table taggables drop constraint taggables_taggable_type_check;
alter table taggables add constraint taggables_taggable_type_check check (taggable_type in ('note', 'task', 'event'));
```
(Constraint name matches Postgres's default naming for the original unnamed `check` — worth confirming against the actual schema before running.)

**`lib/actions/tags.ts`**: `TaggableType` widens to `"task" | "note" | "event"`; `pathFor` gains `event: "/calendar"`; `deleteTagGlobally` gains `revalidatePath("/calendar")`. No other change needed — `createAndAssignTag`/`assignExistingTag`/`unassignTag` already take `taggableType` as a plain parameter, not a hardcoded union member.

**`components/calendar/EventChip.tsx`**: gains a `TagPicker` in its popover (`taggableType="event"`), same as `TaskRow`/`NoteEditor` already have. This is genuinely new UI — nothing tags events today.

**`app/(app)/tags/page.tsx`** (new) — lists every tag (`supabase.from("tags").select().order("name")`) as a link to `/tags/[tagId]`.

**`app/(app)/tags/[tagId]/page.tsx`** (new) — three queries, `taggables` filtered by `tag_id` and each `taggable_type` in turn (joined to `notes`/`tasks`/`events` respectively, same shape as every other `taggables` join in this codebase), rendered as three sections (Notes / Tasks / Events), each item linking to its page (`/notes/{id}`, `/tasks#…` — tasks have no dedicated page, so these link to `/tasks` — or `/calendar` for events, non-deep-linked per the Non-Goals). Empty sections render a "Nothing tagged yet" line, matching `LinkedNotesPicker`'s empty-state tone.

**`components/notes/NoteTagsSection.tsx`**: its pills (currently display + delete only, no click behavior) become `Link`s to `/tags/{tag.id}`.

### Error Handling & Edge Cases

- A tag with zero items of any kind (shouldn't normally happen — creating a tag always assigns it to something): the dashboard renders three empty sections rather than a 404, matching this app's general "empty state, not an error" posture.
- Deleting a tag from its own dashboard: reuses `deleteTagGlobally` exactly as `TagFilterRow`/`NoteTagsSection` already do; the dashboard becomes stale until the next navigation (no realtime removal), same staleness class as every other list in this app.

### Testing Approach

- **Unit tests**: none new — this part is schema + straightforward query/render, no new pure logic.
- **Manual verification**: tag an event (new capability), a task, and a note with the same tag; visit `/tags`, confirm the tag is listed; click through and confirm all three appear in their respective sections; confirm `TagFilterRow`'s existing click-to-filter behavior on the Tasks page is unchanged.
- Full existing suite must stay green.

## Part 4 — Daily Note

### Design

**Extending the embedded-query engine to a third pillar** (`lib/jotter/parseEmbeddedQuery.ts` / `lib/jotter/runEmbeddedQuery.ts`, both from Tier 2):
```ts
export interface EmbeddedQuery {
  pillar: "task" | "note" | "event";
  tag?: string;
  status?: "open" | "done"; // tasks only
  due?: "today" | "overdue" | "week"; // tasks: all three. events: "today" only.
}
export interface QueryableEvent { id: string; title: string; start_at: string; tags: string[] }
```
`QUERY_LINE` becomes `/^\?(tasks|notes|events)(?:\s|$)(.*)$/i`. `runEmbeddedQuery` gains an `event` branch: tag filter, plus `due: "today"` filtering `start_at` against `startOfDay`/`endOfDay` of the reference date (a plain inline check, not `groupTasksByDueDate` — that helper is task-shaped around `due_at` and doesn't fit `start_at`/`end_at` ranges). `overdue`/`week`/`status` are simply not applied to events, mirroring how `due`/`status` are already ignored for `?notes` today.

**`components/notes/editor/embeddedQueryPlugin.ts`**: a third row-rendering branch for `pillar === "event"` — plain text (no checkbox, no link, per the Non-Goals): title + `format(start_at, "h:mm a")`.

**`lib/notes/getOrCreateFolderByName.ts`** (new, small):
```ts
export async function getOrCreateFolderByName(supabase: SupabaseClient<Database>, userId: string, name: string): Promise<string | null> {
  const { data: existing } = await supabase.from("folders").select("id").eq("user_id", userId).is("parent_folder_id", null).eq("name", name).maybeSingle();
  if (existing) return existing.id;
  return createFolderCore(supabase, userId, { name, parentFolderId: null });
}
```
Shared by Part 4 and Part 5.

**`lib/actions/dailyNote.ts`** (new):
```ts
export async function getOrCreateDailyNoteCore(supabase: SupabaseClient<Database>, userId: string, date: Date): Promise<string | null> {
  const folderId = await getOrCreateFolderByName(supabase, userId, "Daily Notes");
  if (!folderId) return null;

  const title = format(date, "EEEE, MMM d, yyyy");
  const { data: existing } = await supabase.from("notes").select("id").eq("folder_id", folderId).eq("title", title).maybeSingle();
  if (existing) return existing.id;

  const bodyMarkdown = "## Tasks due today\n?tasks due:today\n\n## Today's events\n?events due:today\n\n## Journal\n\n";
  const result = await insertNoteCore(supabase, userId, { folderId, title, bodyMarkdown });
  return result.noteId;
}

export async function openTodaysDailyNote() {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;
  const noteId = await getOrCreateDailyNoteCore(supabase, userId, new Date());
  if (noteId) redirect(`/notes/${noteId}`);
}
```
Matching `createNote`'s existing insert-then-`redirect()` shape, not the return-an-id-for-client-nav shape — this has no client-side state to preserve across the navigation.

**Notes page**: a new "Today's Note" link next to the existing "All notes"/"Starred" links, calling `openTodaysDailyNote`.

### Error Handling & Edge Cases

- Visiting "Today's Note" a second time the same day: the exact-title lookup within the `Daily Notes` folder finds the existing note and opens it — no duplicate, no re-templating (any journal content already written stays exactly as typed).
- A user who renames their daily note (e.g. adds a project name to the title): the next day's note won't collide with it (different title), but *that same day's* note will no longer be found by the exact-title lookup either, and clicking "Today's Note" again would create a second note for today. Accepted — same class of edge case as `saveNote`'s optimistic-concurrency conflict banner, not specially guarded against.
- The `Daily Notes` folder is deleted: the next "Today's Note" click recreates it (via `getOrCreateFolderByName`), losing the folder-level organization of past days' notes but not the notes themselves (`folder_id` becomes null on delete, same as any other folder deletion in this app).

### Testing Approach

- **Unit tests**: `parseEmbeddedQuery`/`runEmbeddedQuery`'s new `event` branch (tag filter, `due:today` inclusion/exclusion at day boundaries, `overdue`/`week`/`status` no-ops on events) — extends the existing Tier 2 test files rather than new ones.
- **Manual verification**: click "Today's Note," confirm a note appears in a new `Daily Notes` folder titled with today's date, showing today's due tasks and today's events live; complete one of the shown tasks and confirm it drops out of the query on next load; click "Today's Note" again and confirm it opens the same note rather than creating a second one.
- Full existing suite must stay green.

## Part 5 — Weekly Review

### Design

Deliberately **not** built the same way as the daily note's live-query body. A review describes a fixed, already-over period ("this week," as of when you generated it) — a live `?tasks status:done` query would be wrong twice over: it has no time bound (it'd show *every* done task ever, not this week's), and even if it did, a task someone un-checks later would silently vanish from a *review of what already happened*, which defeats the point of a review. So the retrospective sections are computed once, at generation time, and written as plain markdown — not embedded query lines.

**`lib/actions/weeklyReview.ts`** (new):
```ts
export async function getOrCreateWeeklyReviewCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  referenceDate: Date
): Promise<string | null> {
  const folderId = await getOrCreateFolderByName(supabase, userId, "Weekly Reviews");
  if (!folderId) return null;

  const weekStart = startOfWeek(referenceDate);
  const weekEnd = endOfWeek(referenceDate);
  const title = `Week of ${format(weekStart, "MMM d")}–${format(weekEnd, "MMM d, yyyy")}`;

  const { data: existing } = await supabase.from("notes").select("id").eq("folder_id", folderId).eq("title", title).maybeSingle();
  if (existing) return existing.id;

  const [{ data: completed }, { data: touched }] = await Promise.all([
    supabase.from("tasks").select("title").eq("user_id", userId)
      .gte("completed_at", weekStart.toISOString()).lte("completed_at", weekEnd.toISOString())
      .order("completed_at"),
    supabase.from("notes").select("title").eq("user_id", userId)
      .gte("updated_at", weekStart.toISOString()).lte("updated_at", weekEnd.toISOString())
      .order("updated_at"),
  ]);

  const completedSection = completed?.length ? completed.map((t) => `- [x] ${t.title}`).join("\n") : "_Nothing completed this week._";
  // [[wikilinks]] -- reuses the existing wikilink resolver/click-handler as-is, zero new rendering code.
  const touchedSection = touched?.length ? touched.map((n) => `- [[${n.title}]]`).join("\n") : "_No notes touched this week._";

  const bodyMarkdown = `## Completed this week\n${completedSection}\n\n## Notes touched this week\n${touchedSection}\n\n## Upcoming\n?tasks due:week\n`;
  const result = await insertNoteCore(supabase, userId, { folderId, title, bodyMarkdown });
  return result.noteId;
}

export async function openThisWeeksReview() {
  const { supabase, userId } = await currentUserId();
  if (!userId) return;
  const noteId = await getOrCreateWeeklyReviewCore(supabase, userId, new Date());
  if (noteId) redirect(`/notes/${noteId}`);
}
```
Completed tasks render as plain `- [x] title` text, deliberately *without* the `<!-- task:<uuid> --> ` marker `formatTaskCheckboxLine` would add — a live, un-checkable checkbox implies an interactive item, and unchecking something in a retrospective of a finished week doesn't mean anything. Touched notes go through `[[wikilinks]]` instead of plain links specifically to get real, live backlinks for free (`note_links`/backlinks panel already exists) — a review that mentions a note becomes something that note can see referenced it back, at no extra implementation cost.

**Notes page**: a "This Week" link next to "Today's Note," calling `openThisWeeksReview`.

### Error Handling & Edge Cases

- Revisiting mid-week: same exact-title-lookup idempotency as the daily note — opens the existing in-progress review rather than regenerating it (so any manual edits already made survive).
- A note title containing `]` or `[`: would render a malformed `[[wikilink]]` in the touched-notes section. Not specially escaped — same unescaped-title precedent already accepted throughout this app (e.g. `LinkedNotesPicker`'s pill text).
- Zero completed tasks or zero touched notes: renders the italic placeholder line rather than an empty heading with nothing under it.

### Testing Approach

- **Unit tests**: none new beyond what date-fns' `startOfWeek`/`endOfWeek` already guarantee — this part's only new logic is the query shape, not date math.
- **Manual verification**: complete a couple of tasks and edit a note, then click "This Week," confirm both show up in their sections and the note title shows as a real clickable `[[wikilink]]`; confirm the "Upcoming" section reflects `due:week` live (add a task due later this week and reload); revisit later the same week and confirm it opens the same note.
- Full existing suite must stay green.
