# Drag-to-Timebox and Linked-Mentions Panel — Design Spec

**Date:** 2026-08-28
**Status:** Approved for planning

## Summary

Tier 4 of the cross-pillar interconnectivity roadmap. Two features, both explicitly called out in the original design spec's Phase 2 list as not yet built, now unblocked by infrastructure the earlier tiers put in place:

1. **Drag-to-timebox** — a new "Unscheduled" panel on the Calendar page lists due-date-less tasks; dragging one onto a day converts it into a real calendar event (linked back via the existing `events.linked_task_id`), the same way `insertEventCore`'s `alsoCreateTask` checkbox already links a task to an event, just in the other direction.
2. **Linked-mentions panel extended to events** — a note's existing Backlinks section (note→note wikilinks only) gains a second, sibling section listing any event that uses this note as its generated meeting note (`events.linked_note_id`, from Tier 3) — the one relationship that had no visibility on the note's own page at all.

## Goals

- Turning "I should do this sometime" into "I'm doing this Thursday" takes one drag, not a form.
- A note that's a meeting note knows it's a meeting note — opening it shows which event it belongs to, not just which notes link to it.
- Both features reuse existing linking columns/patterns (`events.linked_task_id`, `events.linked_note_id`) rather than introducing new ones.

## Non-Goals

- **No hourly time grid.** This calendar is day-granularity throughout (`MonthView`/`WeekView` both render `DayCell`s; there's no hour axis anywhere to drop onto). "Timebox" here means "put this task on this *day*," with a fixed default time (9:00 AM, `DEFAULT_EVENT_DURATION_MS` long) — not "put this task at 2:15 PM specifically." Picking an exact time after the drop is an ordinary edit to the resulting event, same as any other event.
- **No dragging an already-scheduled task to reschedule it.** Only tasks with no `due_at` appear in the Unscheduled panel and are draggable this way — a task that already has a due date already renders as a `TaskChip` directly on the grid, and dragging *that* to reschedule is a different, un-scoped feature.
- **No per-user default start time.** 9:00 AM is a fixed constant, matching this app's general "small, opinionated defaults over settings" posture elsewhere (e.g. `DEFAULT_EVENT_DURATION_MS` itself).
- **Tasks are not duplicated into the linked-mentions panel.** `LinkedTasksPicker` already gives full, interactive visibility into a note's linked tasks (search, link, unlink, toggle-complete, Tier 1's hover preview) — showing them a second time as passive pills in the Backlinks-style panel would be redundant UI that could drift out of sync visually. Only events, which have no other home on this page, are added.
- **No deep link from the new event pill to a specific calendar day.** Same reasoning as Tier 3's tag dashboard: no confirmed `?date=` param to link through safely, so it links to `/calendar` bare.

## Part 1 — Drag-to-Timebox

### Design

**`lib/actions/events.ts`** gains, alongside `insertEventCore`:
```ts
export async function timeboxTaskCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  taskId: string,
  date: Date
): Promise<{ ok: boolean; eventId: string | null }> {
  const { data: task } = await supabase.from("tasks").select("title").eq("id", taskId).single();
  if (!task) return { ok: false, eventId: null };

  const startAt = new Date(date);
  startAt.setHours(9, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + DEFAULT_EVENT_DURATION_MS);

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      user_id: userId,
      title: task.title,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      linked_task_id: taskId,
    })
    .select("id")
    .single();
  if (error || !event) return { ok: false, eventId: null };

  // Keeps the task consistent with a linked event's due date the same way
  // rescheduleEventCore already does on drag-reschedule -- a timeboxed task
  // shouldn't still read "no due date" once it has a calendar block.
  await supabase.from("tasks").update({ due_at: startAt.toISOString() }).eq("id", taskId);
  await syncTaskReminder(supabase, userId, taskId, startAt.toISOString());

  return { ok: true, eventId: event.id };
}

export async function timeboxTask(taskId: string, dateIso: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, eventId: null };
  const result = await timeboxTaskCore(supabase, userId, taskId, new Date(dateIso));
  if (result.ok) {
    revalidatePath("/calendar");
    revalidatePath("/tasks");
  }
  return result;
}
```
Reuses `DEFAULT_EVENT_DURATION_MS` (`lib/jotter/duration.ts`, already exported for exactly this kind of reuse since Tier 2) and `syncTaskReminder` (existing) — no new constants, no new reminder logic.

**`components/calendar/UnscheduledTaskChip.tsx`** (new) — a draggable pill, structurally the same `useDraggable` usage `EventChip` already has, just carrying `{ task }` instead of `{ event }` in its drag data. The draggable `id` is prefixed (`task-${task.id}`) since dnd-kit requires unique ids across every draggable in one `DndContext`, and events/tasks are independent UUID spaces with no guaranteed non-collision otherwise.

**`components/calendar/UnscheduledTasksPanel.tsx`** (new) — a flex-wrap row of `UnscheduledTaskChip`s above the calendar grid, labeled "Unscheduled." Unlike the Tasks page's Completed/Archived sections, this is **not** collapsed by default — it's the drag source, so hiding it by default would hide the whole feature. Renders nothing when there are no unscheduled tasks (same empty-state posture as `TagFilterRow`).

**`lib/calendar/useEventDragAndDrop.ts`**: `handleDragEnd` currently only ever reads `dragEvent.active.data.current?.event`. It now checks for `.task` too and branches:
```ts
function handleDragEnd(dragEvent: DragEndEvent) {
  const overId = dragEvent.over?.id;
  if (!overId) return;

  const draggedEvent = dragEvent.active.data.current?.event as Event | undefined;
  if (draggedEvent) {
    const originalKey = dayKey(new Date(draggedEvent.start_at));
    if (overId === originalKey) return;
    const delta = differenceInCalendarDays(new Date(String(overId)), new Date(originalKey));
    startTransition(() =>
      rescheduleEvent(draggedEvent.id, shiftByDays(draggedEvent.start_at, delta), shiftByDays(draggedEvent.end_at, delta))
    );
    return;
  }

  const draggedTask = dragEvent.active.data.current?.task as Task | undefined;
  if (draggedTask) startTransition(() => timeboxTask(draggedTask.id, String(overId)));
}
```
No changes needed to `DayCell`'s `useDroppable` — it already exposes `dayKey(date)` as its droppable id, and doesn't care what kind of thing gets dropped on it.

**`components/calendar/MonthView.tsx` / `WeekView.tsx`**: gain a new `unscheduledTasks: Task[]` prop, rendering `<UnscheduledTasksPanel tasks={unscheduledTasks} />` **inside** their existing `<DndContext>` (each view already owns one) — the panel has to live inside the same `DndContext` boundary as the `DayCell`s it drags onto, so it's threaded in as a prop rather than lifted to a page-level context that would require restructuring both views' existing internal ownership of `useEventDragAndDrop()`.

**`app/(app)/calendar/page.tsx`**: one new query, `supabase.from("tasks").select().is("due_at", null).is("completed_at", null).order("created_at")`, passed to whichever view is active as `unscheduledTasks`.

### Error Handling & Edge Cases

- Dropping a task back onto empty space (not a valid day cell): `dragEvent.over` is `null`, `handleDragEnd` returns immediately — no-op, matching the existing event-drag behavior for the same case.
- Timeboxing fails server-side (e.g. task deleted mid-drag): `result.ok` is false, nothing revalidates, the panel simply doesn't update — the task reappears on next real navigation since it's still unscheduled server-side.
- The same task dragged twice in quick succession: creates two events, both linked to the same task via `linked_task_id` — not specially guarded against. `events.linked_task_id` has no uniqueness constraint (an event's own `linked_task_id` is single-valued, but nothing stops two *different* events from pointing at the same task), same trust-the-user posture used throughout this codebase's linking actions.
- Dropped task title contains characters that don't make sense as an event title: none — the title is copied verbatim from the task, same unescaped-string precedent as everywhere else.

### Testing Approach

- **Unit tests**: none new — `timeboxTaskCore` is a straightforward core action (insert + update + reminder sync), same shape as `insertEventCore`/`generateMeetingNoteCore`, which aren't unit-tested as pure functions either.
- **Manual verification**: create a task with no due date, confirm it appears in the Unscheduled panel; drag it onto a day in Month view, confirm an event appears there titled the same as the task, the task now shows that due date on `/tasks`, and the task drops out of the Unscheduled panel; repeat in Week view.
- Full existing suite must stay green.

## Part 2 — Linked-Mentions Panel Extended to Events

### Design

**`app/(app)/notes/[noteId]/page.tsx`**: one new query, `supabase.from("events").select("id, title, start_at").eq("linked_note_id", noteId)`, passed to `NoteEditor` as `linkedEvents`.

**`components/notes/NoteEditor.tsx`**: new `linkedEvents: { id: string; title: string; start_at: string }[]` prop, rendered as a sibling section right after the existing Backlinks block:
```tsx
{linkedEvents.length > 0 && (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-muted-foreground">Meeting for</span>
    <ul className="flex flex-wrap gap-1.5">
      {linkedEvents.map((event) => (
        <li key={event.id}>
          <Link href="/calendar" className="rounded-full border bg-muted px-2 py-0.5 text-xs hover:bg-accent">
            {event.title} · {format(new Date(event.start_at), "MMM d")}
          </Link>
        </li>
      ))}
    </ul>
  </div>
)}
```
Same pill styling as the existing Backlinks list, so the two sections read as one visual family even though they're populated from unrelated tables (`note_links` vs `events`).

### Error Handling & Edge Cases

- A note with no linked event (the common case, including every note *not* generated via meeting-note generation): section renders nothing, same as Backlinks' own empty state.
- More than one event pointing at the same note: the schema never enforced one-event-per-note (`generateMeetingNoteCore` never *reuses* another event's note, but nothing stops a future direct edit from creating this), so the query and rendering both handle a list, not a single optional value.
- The linked event is deleted: `events.linked_note_id`'s existence is the query's only input, so the pill simply stops appearing on the note's next load — no cleanup needed on the note side, since the note never stored anything about the event.

### Testing Approach

- **Unit tests**: none — this is a query plus a render, no new pure logic.
- **Manual verification**: generate a meeting note for an event (Tier 3's feature), open that note directly, confirm a "Meeting for" pill appears showing the event's title and date; delete the event and confirm the pill disappears on reload.
- Full existing suite must stay green.
