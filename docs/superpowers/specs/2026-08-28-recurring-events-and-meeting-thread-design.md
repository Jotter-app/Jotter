# Minimal Recurrence Infrastructure + Recurring-Meeting Note Threads — Design Spec

**Date:** 2026-08-28
**Status:** Approved for planning

## Summary

Tier 5 of the cross-pillar interconnectivity roadmap — the one item every earlier tier's spec flagged as genuinely blocked, not just unbuilt: "recurring meetings auto-link each occurrence to a running note thread that references the prior occurrence." It's blocked because recurring events don't exist in any real sense yet — `events.recurrence_rule` is a column nobody writes to, no `rrule` library is installed, and no expansion code exists anywhere in `lib/`.

This spec builds **just enough** recurrence to unblock that one feature, deliberately **not** the full system the original design spec's Phase 2 section called for ("RRULE parsing/expansion for calendar rendering, *and* the `recurrence_exceptions` model... scope both together"). See Non-Goals for exactly what's being deferred and why.

1. **Part 1 — Minimal recurrence infrastructure**: a `Repeats` dropdown (Daily/Weekly/Monthly) on event creation, virtual (unmaterialized) occurrences computed on the fly for calendar rendering via the `rrule` package, and lazy materialization — an occurrence only becomes a real `events` row the first time something is done with it.
2. **Part 2 — Recurring-meeting note threads**: materializing an occurrence and generating its meeting note (Tier 3's feature) now looks up the *previous* occurrence's note in the same series and pre-fills a `[[wikilink]]` reference to it — a real, navigable, backlinked chain, using the existing wikilink system as-is.

## Goals

- Creating a weekly standup takes one dropdown selection, not a form.
- Generating a meeting note for this week's occurrence of a recurring meeting automatically references last week's note.
- The chain is built from real wikilinks (existing infra, Tier 1/3 already exercise this), not a new "previous occurrence" data model.
- Once an occurrence exists as a real row, it behaves exactly like any other event — same tag picker, same delete, same drag-reschedule, same "Generate note" idempotency. No parallel code path for "a recurring event" after the point it's materialized.

## Non-Goals

This is the load-bearing section — it's a deliberate narrowing of the original Phase 2 recurrence scope down to exactly what the note-thread feature needs, not a first slice of the general system.

- **No `recurrence_exceptions` table, no skip-this-occurrence, no "edit this vs. all occurrences."** The original design spec explicitly wanted these built together with rule expansion; this spec builds only the expansion half. A recurring event's pattern is fixed at creation and applies uniformly to every future occurrence — there's no way to make "every Monday except the 15th" yet.
- **No recurring tasks.** `tasks.recurrence_rule` stays exactly as unused as it is today. Only events get this.
- **No RRULE editing UI beyond Daily/Weekly/Monthly.** No custom intervals ("every 2 weeks"), no multi-day-of-week selection, no end date/count. `AddEventDialog`'s new `Repeats` field maps directly to one of three fixed RRULE strings.
- **No editing a recurrence rule after creation.** Events have no general edit UI today at all (only drag-reschedule and delete) — there's nothing to extend, so this isn't a narrowing so much as an existing gap this spec doesn't touch either.
- **A virtual (unmaterialized) occurrence has no tag picker, isn't draggable, and can't be deleted individually.** It's not a real row yet — those affordances only make sense once it is. The *only* thing you can do with one is generate its note, which materializes it.
- **No Google/Outlook sync implications considered.** The original spec noted the exceptions model is what external-calendar imports would also need; since this spec skips exceptions entirely, it does nothing to prepare for that either.
- **No timezone-aware recurrence math.** Occurrence dates are computed with plain JS `Date` arithmetic in whatever timezone the server process runs in — the same lack of explicit timezone handling every other date computation in this app already has (e.g. drag-to-timebox's fixed 9am). Not a new gap, just not a fixed one either.

## Part 1 — Minimal Recurrence Infrastructure

### Design

**New dependency**: `rrule` (`npm install rrule`) — the standard, actively maintained RRULE implementation; nothing in this codebase implements recurrence math today.

**New migration**:
```sql
-- Self-referencing: a recurring event's own id is written into its own
-- series_id, so "every occurrence of this series" is always a uniform
-- `where series_id = X` query, master included -- no OR-branching between
-- "is the master" and "is a later occurrence." on delete set null (not
-- cascade): deleting the master stops future occurrences from being
-- generated without deleting materialized ones that already happened.
alter table events add column series_id uuid references events(id) on delete set null;
create index events_series_idx on events (series_id) where series_id is not null;
```
`events.recurrence_rule` (already existing, previously unused) stores a bare RRULE string (e.g. `"FREQ=WEEKLY"`) — only ever set on a series' master row. A materialized later occurrence has `recurrence_rule: null` and `series_id` pointing at the master; the master has both `recurrence_rule` set and `series_id` pointing at itself.

**`lib/calendar/expandRecurrence.ts`** (new, pure):
```ts
import { RRule } from "rrule";
import { dayKey } from "@/lib/calendar/grid";

export interface VirtualOccurrence {
  seriesId: string;
  title: string;
  calendarColor: string;
  startAt: Date;
  endAt: Date;
}

export function expandRecurringEvent(
  master: { id: string; title: string; start_at: string; end_at: string; calendar_color: string; recurrence_rule: string },
  alreadyMaterializedDateKeys: Set<string>,
  rangeStart: Date,
  rangeEnd: Date
): VirtualOccurrence[] {
  const durationMs = new Date(master.end_at).getTime() - new Date(master.start_at).getTime();
  const rule = new RRule({ ...RRule.parseString(master.recurrence_rule), dtstart: new Date(master.start_at) });

  return rule
    .between(rangeStart, rangeEnd, true)
    .filter((date) => !alreadyMaterializedDateKeys.has(dayKey(date)))
    .map((date) => ({
      seriesId: master.id,
      title: master.title,
      calendarColor: master.calendar_color,
      startAt: date,
      endAt: new Date(date.getTime() + durationMs),
    }));
}
```
The caller is responsible for seeding `alreadyMaterializedDateKeys` with every date that already has a real row in this series *including the master's own start date* — otherwise the master (a real row already rendered normally) would also show up a second time as a virtual occurrence on its own date, since `rule.between()` includes the `dtstart` occurrence itself.

**`components/calendar/AddEventDialog.tsx`**: gains a `Repeats` `<select>` (`none` / `daily` / `weekly` / `monthly`, default `none`) next to the existing "Also add as a task" checkbox.

**`lib/actions/events.ts`**: `eventSchema` gains `repeats: z.enum(["none", "daily", "weekly", "monthly"]).default("none")`; `insertEventCore` gains an optional `recurrenceRule?: string` param — when set, insert with `recurrence_rule: recurrenceRule`, then a follow-up `update` sets `series_id` to the newly-inserted row's own id:
```ts
if (recurrenceRule) {
  await supabase.from("events").update({ series_id: event.id }).eq("id", event.id);
}
```
`createEvent` maps the form's `repeats` value to a bare RRULE string before calling `insertEventCore`:
```ts
const RECURRENCE_RULES: Record<string, string | undefined> = {
  none: undefined,
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
};
```

**`components/calendar/RecurringOccurrenceChip.tsx`** (new) — the limited, non-interactive-except-for-one-button rendering for a virtual occurrence: title, time, and a single "Generate note" button (Part 2). No `useDraggable`, no `TagPicker`, no delete — none of those make sense before the row exists.

**`app/(app)/calendar/page.tsx`**: two additions —
1. A new query, `supabase.from("events").select().not("recurrence_rule", "is", null)` — every series master for this user, regardless of the master's own date (a series created months ago must still generate this week's occurrence).
2. For each master, build `alreadyMaterializedDateKeys` from the *existing* `events` query result (materialized occurrences are ordinary rows with real `start_at` values, so they're already fetched by the existing range query — no second query needed) filtered to `series_id === master.id`, plus the master's own date; call `expandRecurringEvent`; pass the combined `virtualOccurrences` list down to `MonthView`/`WeekView` → `DayCell`, rendered via `RecurringOccurrenceChip` alongside the real `EventChip`/`TaskChip` rows already there.

### Error Handling & Edge Cases

- The master event is deleted: `series_id`'s `on delete set null` clears every materialized occurrence's `series_id` (they survive as ordinary standalone events, same pattern as an event losing a deleted `linked_task_id`/`linked_note_id`), and the master itself drops out of the `recurrence_rule is not null` query — no more virtual occurrences are generated going forward.
- Two different series happen to want the same day: each master is expanded independently; nothing dedupes across series, since they're unrelated recurring events that legitimately can both land on the same date.
- A materialized occurrence is later deleted (via the normal `EventChip` delete flow): it's a real row, so it's just gone — the *next* calendar load recomputes virtual occurrences for that series, and since that date is no longer in `alreadyMaterializedDateKeys`, it reappears as a virtual (regeneratable) occurrence again. Not specially guarded against; falls out of the design rather than needing to.
- An infinite rule (no `COUNT`/`UNTIL` — the only kind this spec's fixed Daily/Weekly/Monthly options ever produce) with a very wide visible range: `rule.between()` is bounded by the range passed in, so this is naturally capped by whatever the Month/Week view's own date range already is.

### Testing Approach

- **Unit tests**: `expandRecurringEvent` (daily/weekly/monthly expansion within a range, excludes already-materialized dates including the master's own, excludes the master's own start date, empty result for a range with no occurrences).
- **Manual verification**: create a weekly recurring event, confirm virtual occurrences (visually distinct, non-draggable) appear on the correct future dates in both Month and Week view; confirm the master's own date shows the normal, real `EventChip` and not also a virtual one.
- Full existing suite must stay green.

## Part 2 — Recurring-Meeting Note Threads

### Design

**`lib/actions/events.ts` — `generateMeetingNoteCore`** (existing, from Tier 3) gains a `series_id`-aware branch, rather than a parallel function:
```ts
export async function generateMeetingNoteCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string
): Promise<{ ok: boolean; noteId: string | null }> {
  const { data: event } = await supabase
    .from("events")
    .select("title, start_at, end_at, linked_note_id, series_id")
    .eq("id", eventId)
    .single();
  if (!event) return { ok: false, noteId: null };
  if (event.linked_note_id) return { ok: true, noteId: event.linked_note_id };

  // Thread this occurrence to whichever prior occurrence in the same
  // series most recently got a note -- [[wikilink]], not a new "previous
  // occurrence" column, so it's a real, navigable, backlinked reference
  // using infra that already exists (Tier 3's weekly review does the same
  // trick for its "notes touched" section).
  let previousNoteTitle: string | null = null;
  if (event.series_id) {
    const { data: prior } = await supabase
      .from("events")
      .select("linked_note_id")
      .eq("series_id", event.series_id)
      .not("linked_note_id", "is", null)
      .lt("start_at", event.start_at)
      .order("start_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior?.linked_note_id) {
      const { data: prevNote } = await supabase.from("notes").select("title").eq("id", prior.linked_note_id).single();
      previousNoteTitle = prevNote?.title ?? null;
    }
  }

  const range = `${format(new Date(event.start_at), "MMM d, yyyy · h:mm a")}–${format(new Date(event.end_at), "h:mm a")}`;
  const bodyMarkdown = previousNoteTitle
    ? `**${range}**\n\nPrevious: [[${previousNoteTitle}]]\n\n`
    : `**${range}**\n\n`;

  // Every occurrence of a series shares the exact same event.title -- a
  // bare title would make every occurrence's note collide, and
  // resolveWikilinkTitle's "most recently edited wins" tie-break would then
  // make the "Previous" wikilink resolve to whichever note was touched most
  // recently (in practice, often itself, right after being created) instead
  // of the actual prior occurrence. Found this exact failure manually
  // testing a 3rd occurrence's note during implementation -- the date
  // suffix makes each occurrence's note title unique so the wikilink
  // resolves unambiguously. A non-recurring event (no series_id) keeps its
  // bare title exactly as before.
  const title = event.series_id ? `${event.title} — ${format(new Date(event.start_at), "MMM d, yyyy")}` : event.title;
  const result = await insertNoteCore(supabase, userId, { folderId: null, title, bodyMarkdown });
  if (!result.ok || !result.noteId) return { ok: false, noteId: null };

  await supabase.from("events").update({ linked_note_id: result.noteId }).eq("id", eventId);
  await syncEventDebriefReminder(supabase, userId, eventId, event.end_at);

  return { ok: true, noteId: result.noteId };
}
```
This means a *non*-recurring event's meeting note (Tier 3's original case) is unaffected — `event.series_id` is null, the whole branch is skipped, output is byte-for-byte what it already was.

**`lib/actions/events.ts`** gains the materialization step, composed with the now-series-aware `generateMeetingNoteCore` rather than duplicating its note-creation logic:
```ts
export async function materializeOccurrenceCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  seriesId: string,
  startAtIso: string,
  endAtIso: string
): Promise<{ ok: boolean; eventId: string | null }> {
  const { data: master } = await supabase.from("events").select("title, calendar_color").eq("id", seriesId).single();
  if (!master) return { ok: false, eventId: null };

  const { data: occurrence, error } = await supabase
    .from("events")
    .insert({
      user_id: userId,
      title: master.title,
      start_at: startAtIso,
      end_at: endAtIso,
      calendar_color: master.calendar_color,
      series_id: seriesId,
    })
    .select("id")
    .single();
  if (error || !occurrence) return { ok: false, eventId: null };

  return { ok: true, eventId: occurrence.id };
}

export async function materializeOccurrenceAndGenerateNote(seriesId: string, startAtIso: string, endAtIso: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, eventId: null, noteId: null };

  const materialized = await materializeOccurrenceCore(supabase, userId, seriesId, startAtIso, endAtIso);
  if (!materialized.ok || !materialized.eventId) return { ok: false, eventId: null, noteId: null };

  const noteResult = await generateMeetingNoteCore(supabase, userId, materialized.eventId);
  if (noteResult.ok) {
    revalidatePath("/calendar");
    revalidatePath("/notes");
  }
  return { ok: noteResult.ok, eventId: materialized.eventId, noteId: noteResult.noteId };
}
```

**`components/calendar/RecurringOccurrenceChip.tsx`**'s "Generate note" button calls `materializeOccurrenceAndGenerateNote(seriesId, startAt.toISOString(), endAt.toISOString())`, then navigates to the returned `noteId` — same `router.push` pattern `EventChip`'s own "Generate note" button already uses.

Once this returns, the occurrence is a real row: the calendar's next load renders it as a normal `EventChip` (not a `RecurringOccurrenceChip`), which already shows "View meeting note" instead of "Generate note" (Tier 3, unchanged) and already supports tagging, dragging, and deleting (also unchanged) — no new code needed for any of that, it falls out of materialization meaning "this is now an ordinary event."

### Error Handling & Edge Cases

- Generating a note for the *first* occurrence of a series (the master itself, already a real row): `event.series_id` is set (points at itself) but the `.lt("start_at", event.start_at)` query can never match anything earlier than itself, so `previousNoteTitle` stays null and the note has no "Previous" line — correct, there's nothing before the first occurrence.
- Two occurrences materialized out of chronological order (e.g. generating next month's note before this month's): "previous" is determined purely by `start_at` ordering among occurrences that already have notes, not by materialization order or click order — whichever occurrence is chronologically most recent *and has a note* wins, regardless of when it was generated.
- The "previous" note is later deleted: the wikilink becomes a broken-link (same red, dashed-underline treatment `wikilinkPlugin` already renders for any unresolved `[[title]]`) — not specially handled, matching how every other wikilink in this app already degrades.
- Clicking "Generate note" on the same virtual occurrence twice in quick succession (e.g. a double-click): each click independently materializes — this can create two separate event rows for the same date/series, both with their own generated note. Not guarded against, same trust-the-user posture used throughout this codebase's other click-triggered creation actions (e.g. Tier 4's drag-to-timebox has the identical accepted risk for a fast double-drag).
- **Found during manual testing, not anticipated at design time**: every occurrence's note titled bare `event.title` meant every note in a series shared the identical title, and `resolveWikilinkTitle`'s existing "most recently edited wins" ambiguity rule then made a freshly-generated note's own "Previous" wikilink resolve to *itself* (the note just created is, by definition, the most recently edited note with that title) rather than the actual prior occurrence. Fixed by suffixing a series occurrence's note title with its own date (`"Weekly Standup — Aug 18, 2026"`), making every occurrence's title unique. Verified by generating three consecutive occurrences' notes and confirming the third's "Previous" link resolved to the second's note id, not the first's or its own.

### Testing Approach

- **Unit tests**: none new beyond Part 1's `expandRecurringEvent` coverage — this part is composition of already-tested/existing pieces (`insertNoteCore`, `syncEventDebriefReminder`, the wikilink system), not new pure logic.
- **Manual verification**: create a weekly recurring event, generate the note for the master occurrence, then generate the note for next week's virtual occurrence and confirm its body contains a `[[wikilink]]` to the master's note title that resolves (not shown as broken); generate a third occurrence's note and confirm it links to the *second* occurrence's note, not the first; confirm the master's own note has no "Previous" line.
- Full existing suite must stay green.
