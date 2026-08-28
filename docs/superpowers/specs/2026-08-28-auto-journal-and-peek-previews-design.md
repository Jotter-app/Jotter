# Auto-Journal on Task Completion + Cross-Pillar Peek Previews — Design Spec

**Date:** 2026-08-28
**Status:** Approved for planning

## Summary

Tier 1 of the cross-pillar interconnectivity roadmap: two independent features that need zero new schema and reuse infrastructure that already exists.

1. **Auto-journaling** — completing a task that's linked to one or more notes (`task_note_links`) appends a timestamped line to each linked note's body automatically.
2. **Cross-pillar peek previews** — hovering a linked-note pill on the Tasks page, or a linked-task row in the Notes editor, opens a small preview card (note snippet + edited time; task priority/due date/status) without navigating away.

Both features only touch the note↔task link (`task_note_links`), which already exists and is already bidirectionally surfaced via `LinkedNotesPicker` ([components/tasks/LinkedNotesPicker.tsx](components/tasks/LinkedNotesPicker.tsx)) and `LinkedTasksPicker` ([components/notes/LinkedTasksPicker.tsx](components/notes/LinkedTasksPicker.tsx)). Neither feature touches events — event↔note linking doesn't exist yet (that's Tier 3).

## Goals

- Completing a linked task leaves a durable, automatic trace in its note(s) — no manual copy-paste of "I did this."
- A linked note/task's key details are visible at a glance from wherever it's referenced, without a click-through.
- Both features are additive: no new tables, no new pages, no changes to how linking itself works.

## Non-Goals

- No event-side journaling or previews — there's no `events.linked_note_id` yet (Tier 3).
- No removal or de-duplication of journal lines when a task is un-completed or re-completed — every transition to `completed` appends a new line; this is a log, not a synced summary.
- No configurable journal format, heading, or opt-out — always-on, matching how `task_note_links` itself has no settings today.
- No markdown-to-plaintext rendering in the preview snippet — it's the raw `body_markdown` source, whitespace-collapsed and truncated. A note that opens with a heading or list marker will show a literal `#`/`-` at the start of its snippet; acceptable for a peek, not worth a markdown stripper.
- No peek preview for tags, folders, or note backlinks — scoped strictly to the two existing task↔note picker components.
- No new hover-delay/disable setting — Base UI's `PreviewCard` ships with sensible open/close-delay defaults out of the box.

## Part 1 — Auto-Journal on Task Completion

### Design

**`lib/notes/appendJournalLine.ts`** (new, pure function — same "extract the pure logic" precedent as `lib/dates/relativeDays.ts` / `lib/tasks/groupTasksByDueDate.ts`):
```ts
export function appendJournalLine(body: string, line: string): string {
  const trimmed = body.trimEnd();
  return trimmed ? `${trimmed}\n\n${line}` : line;
}
```

**`lib/notes/appendTaskCompletionJournal.ts`** (new — same seam pattern as `syncTaskReminder` and `processNoteTaskCommands`: a cross-table side effect factored out of `lib/actions/tasks.ts` so the action stays thin):
```ts
export async function appendTaskCompletionJournalCore(
  supabase: SupabaseClient<Database>,
  taskId: string,
  taskTitle: string
): Promise<string[]> {
  const { data: links } = await supabase
    .from("task_note_links")
    .select("note_id, notes(body_markdown)")
    .eq("task_id", taskId);
  if (!links || links.length === 0) return [];

  const line = `- Completed "${taskTitle}" — ${format(new Date(), "MMM d, yyyy 'at' h:mm a")}`;
  const touchedNoteIds: string[] = [];
  for (const link of links) {
    if (!link.notes) continue;
    const newBody = appendJournalLine(link.notes.body_markdown, line);
    await supabase.from("notes").update({ body_markdown: newBody }).eq("id", link.note_id);
    touchedNoteIds.push(link.note_id);
  }
  return touchedNoteIds;
}
```
Returns the touched note ids so the caller can revalidate their pages precisely.

**`lib/actions/tasks.ts` — `toggleTaskComplete`**: gains the title via the existing update call (no signature change, no call-site changes — `EventChip`'s `LinkedTask` type, `TaskChip`, `LinkedTasksPicker`'s checkbox, etc. all keep calling it exactly as today):
```ts
const { data: updatedTask } = await supabase
  .from("tasks")
  .update(updates)
  .eq("id", taskId)
  .select("title")
  .single();

await syncTaskReminder(supabase, userId, taskId, completed ? null : dueAt);

if (completed && updatedTask) {
  const touchedNoteIds = await appendTaskCompletionJournalCore(supabase, taskId, updatedTask.title);
  for (const noteId of touchedNoteIds) revalidatePath(`/notes/${noteId}`);
}

revalidatePath("/tasks");
revalidatePath("/calendar");
revalidatePath("/notes");
```
The `notes` table already has a `before update` trigger that bumps `updated_at` (per `insertNoteCore`'s existing comment on that trigger), so this side effect also naturally makes `saveNote`'s optimistic-concurrency check fire correctly if the note happens to be open in an editor tab at the same time — no extra wiring needed for that safety net, it falls out of the existing conflict-check design.

### Error Handling & Edge Cases

- Task linked to multiple notes: appends to all of them, independently.
- Task linked to zero notes: no-op — `appendTaskCompletionJournalCore` returns early, no extra queries beyond the one lookup.
- Task title contains markdown-special characters (`*`, `[`, `]`, etc.): inserted as-is, unescaped — same precedent as every other place a task/note title is interpolated in this codebase (e.g. `LinkedNotesPicker`'s pill text).
- Un-completing a task never touches its notes — only the `completed === true` branch runs the journal step.
- A note deleted after being linked but before the task is completed: `link.notes` comes back `null` from the join (row gone) and is skipped, matching the existing `?? []` / `if (!row.notes) continue` guard style used throughout this codebase's link-fetching code.

### Testing Approach

- **Unit tests**: `appendJournalLine` (empty body, non-empty body, body with trailing whitespace).
- **Manual verification**: link a task to two notes, complete it, confirm both notes gain the line; un-complete and re-complete, confirm a second line is appended (not deduped); complete a task with no linked notes, confirm no error and no note touched.
- Full existing suite (`tsc`, lint, unit, integration, `next build`, Playwright e2e) must stay green.

## Part 2 — Cross-Pillar Peek Previews

### Design

**`components/ui/preview-card.tsx`** (new) — mirrors [components/ui/popover.tsx](components/ui/popover.tsx) exactly (`Root`/`Trigger`/`Portal`/`Positioner`/`Popup`), but wraps `@base-ui/react/preview-card` instead of `.../popover`. This is Base UI's dedicated hover-triggered component (distinct from `Popover`, which is click-triggered) — confirmed present in the installed `@base-ui/react@1.7.0` package. Exports `PreviewCard`, `PreviewCardTrigger`, `PreviewCardContent`, matching the naming convention already established for `Popover*`.

**`lib/notes/notePreviewSnippet.ts`** (new, pure function):
```ts
export function notePreviewSnippet(bodyMarkdown: string, maxLength = 150): string {
  const collapsed = bodyMarkdown.replace(/\s+/g, " ").trim();
  if (!collapsed) return "No content yet.";
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength).trimEnd()}…` : collapsed;
}
```

**`components/tasks/LinkedNotesPicker.tsx`**: `NoteOption` grows from `{ id, title }` to `{ id, title, body_markdown, updated_at }`. Each linked-note pill's `<Link>` becomes a `PreviewCardTrigger` (rendering the same `<Link>` via the `render` prop, matching how `EventChip`'s `PopoverTrigger` wraps its button today). `PreviewCardContent` shows the note title, `Edited {formatDistanceToNow(updated_at, { addSuffix: true })}` (same call already used in `NoteEditor.tsx:147`), and `notePreviewSnippet(body_markdown)`.

**`app/(app)/tasks/page.tsx`**: the `task_note_links` select widens from `"task_id, notes(id, title)"` to `"task_id, notes(id, title, body_markdown, updated_at)"`. `linkedNotesByTaskId`'s value type widens to match. `TaskRow`'s `linkedNotes` prop type widens to match (passed straight through, no transform needed).

**`components/notes/LinkedTasksPicker.tsx`**: `TaskOption` grows from `{ id, title, completed_at, due_at }` to add `priority: number`. Each linked-task `<span>` becomes a `PreviewCardTrigger`. `PreviewCardContent` shows the task title, a priority dot + label (`priorityColor`/`priorityLabel` from [lib/tasks/priority.ts](lib/tasks/priority.ts), same as `TaskRow`), and due date (`formatRelativeDays` + `format(dueAt, "MMM d, h:mm a")`, same formatting already used in `TaskRow`/`EventChip`/`TaskChip`) or "No due date" when null, plus completed/not-completed state.

**`app/(app)/notes/[noteId]/page.tsx`**: the `task_note_links` select widens from `"tasks(id, title, completed_at, due_at)"` to `"tasks(id, title, completed_at, due_at, priority)"`. The separate `allTasks` query (feeds the "+ link task" search list, not the preview) is left untouched.

### Error Handling & Edge Cases

- Empty note body: preview shows "No content yet." instead of a blank line.
- Very long note body or long task title: snippet truncated at 150 chars with an ellipsis; title itself is not truncated (matches how pills already render full titles today).
- Touch devices without hover: Base UI's `PreviewCard` is a hover/focus-triggered pattern by design and simply won't open on touch — the underlying `<Link>`/checkbox stays fully tappable either way, so no functionality is lost, only the preview convenience.
- Rapid mouse movement across several pills: handled by `PreviewCard`'s built-in open/close delay (hover-intent), no custom debounce needed.

### Testing Approach

- **Unit tests**: `notePreviewSnippet` (empty body, short body, body over the length cap, body with newlines/extra whitespace).
- **Manual verification**: on the Tasks page, hover a linked-note pill and confirm the preview shows the right snippet and edited-time; edit that note's body and confirm the snippet updates after the page revalidates; in the Notes editor, hover a linked-task row and confirm priority/due-date/status render correctly for a task with no due date, an overdue task, and a completed task.
- Full existing suite (`tsc`, lint, unit, integration, `next build`, Playwright e2e) must stay green.
