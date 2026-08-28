# Line-to-Task, In-Note Date Detection, and Live Embedded Queries — Design Spec

**Date:** 2026-08-28
**Status:** Approved for planning

## Summary

Tier 2 of the cross-pillar interconnectivity roadmap: three editor-level features, all extensions of the same CodeMirror plugin architecture the note body editor already uses (`wikilinkPlugin.ts`, `liveMarkdownPlugin.ts`, `lineEmbedPlugin.ts` in `components/notes/editor/`), plus the `chrono-node` date parsing this app already ships for quick-add.

1. **Line-to-task** — a new toolbar button converts the current line into a linked task in place, reusing the exact checkbox+marker format `processNoteTaskCommands` already produces for `/task create` lines.
2. **In-note date detection** — typing a date/time phrase on its own decorates it with a "Create event?" prompt; clicking it creates a standalone calendar event.
3. **Live embedded queries** — a `?tasks #tag` / `?notes #tag` line renders a live, filtered list of matching tasks or notes directly in the editor, Dataview-style.

None of these need new tables. Query filtering runs against the same kind of page-loaded snapshot (`allNoteTitles`, `linkedTasks`, etc.) the editor already uses for wikilink autocomplete and linked-task checkboxes — not a live subscription.

## Goals

- Converting a line of prose into a real, linked task (or a detected date into a real event) takes one click, no retyping.
- A note can show a live, filtered view of tasks or notes elsewhere in the app without leaving the editor.
- Every new interaction reuses an existing CM6 extension pattern, existing creation logic (`insertTaskCore`, `insertEventCore`), and the existing task-marker idempotency convention — no parallel creation paths.

## Non-Goals

- **No event↔note link.** `events` has no `linked_note_id` column yet (that's Tier 3, alongside meeting-note generation and the post-meeting debrief). An event created from in-note date detection is a standalone event, not a linked one — the note doesn't show "this note created that event" anywhere beyond the inert marker that keeps it from being re-created.
- **No event-tag filtering in embedded queries.** `taggables.taggable_type` only accepts `'note'` and `'task'` today (Tier 3 extends it to `'event'` for tag-page dashboards). Embedded queries are scoped to `?tasks` and `?notes` only.
- **Line-to-task operates on the whole line, not the exact character selection.** Despite the brainstormed feature's "select text" framing, the implementation follows `toggleLinePrefix`'s existing whole-line precedent (`doc.lineAt(selection.main.head)`) rather than gating on a non-empty selection — simpler, and a checkbox needs to be the start of its line for `liveMarkdownPlugin`'s `TaskMarker` handling to recognize it at all. Placing the cursor anywhere on a line and clicking the button converts that whole line.
- **One date match per line, one query per line.** Both new line-scanning plugins stop at the first match, mirroring `parseQuickAdd`'s own "first chrono match wins" behavior. A line with two date phrases only gets a prompt for the first; a line can't combine two `?` queries.
- **No query language beyond `#tag` / `status:` / `due:`.** No boolean operators, no sorting options, no arbitrary field filters. `due:` reuses `groupTasksByDueDate`'s existing buckets verbatim rather than introducing new date-range logic.
- **No "view all" link on a truncated query result.** Results cap at 10 with a plain "+N more" count, not a link to a filtered list page (no such page exists for an arbitrary tag+status+due combination).

## Part 1 — Line-to-Task

### Design

**`lib/jotter/formatTaskCheckboxLine.ts`** (new, pure — factored out of `processNoteCommands.ts` so both callers stay byte-for-byte identical):
```ts
export function formatTaskCheckboxLine(taskId: string, title: string, dueAt: Date | null, tags: string[]): string {
  const dueText = dueAt ? ` (due ${format(dueAt, "MMM d, h:mm a")})` : "";
  const tagsText = tags.map((tag) => ` #${tag}`).join("");
  return `- [ ] ${title}${dueText}${tagsText} <!-- task:${taskId} -->`;
}
```
`lib/jotter/processNoteCommands.ts` swaps its inline line-construction for a call to this.

**`lib/actions/taskNoteLinks.ts`** (existing file — this is already the home of task↔note link actions) gains:
```ts
export async function createTaskFromNoteLineCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  noteId: string,
  lineText: string
): Promise<{ ok: boolean; replacementLine: string | null }> {
  const trimmed = lineText.trim();
  if (!trimmed) return { ok: false, replacementLine: null };

  const { title: titleWithTags, dueAt } = parseQuickAdd(trimmed);
  const { title, tags } = extractAndStripTags(titleWithTags);
  if (!title) return { ok: false, replacementLine: null };

  const result = await insertTaskCore(supabase, userId, { title, dueAt, tagNames: tags });
  if (!result.ok || !result.taskId) return { ok: false, replacementLine: null };

  await linkTaskNoteCore(supabase, userId, result.taskId, noteId);
  return { ok: true, replacementLine: formatTaskCheckboxLine(result.taskId, title, dueAt, tags) };
}

export async function createTaskFromNoteLine(noteId: string, lineText: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, replacementLine: null };
  const result = await createTaskFromNoteLineCore(supabase, userId, noteId, lineText);
  if (result.ok) {
    revalidatePath("/tasks");
    revalidatePath("/calendar");
  }
  return result;
}
```
Reuses `parseQuickAdd` + `extractAndStripTags` — the exact same pair `parseImplicit.ts` already uses for freeform text — so "Call the dentist tomorrow 5pm #health" typed as a line and converted picks up the due date and tag exactly like quick-add would, not literally titled with the date text still in it.

**`components/notes/NoteEditor.tsx`**: new handler, following the existing `withView`/`startTransition` shape every other toolbar command already uses:
```ts
function handleCreateTaskFromLine() {
  withView((view) => {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    if (!line.text.trim()) return;
    startTransition(async () => {
      const result = await createTaskFromNoteLine(note.id, line.text);
      if (result.ok && result.replacementLine) {
        view.dispatch({ changes: { from: line.from, to: line.to, insert: result.replacementLine } });
      }
    });
  });
}
```
New toolbar button (a `ListTodo` icon, distinct from the existing checklist-prefix `ListChecks` button — lucide-react already a dependency), placed after the existing Link button, `aria-label="Create linked task from this line"`.

Because the replacement line is byte-for-byte what `processNoteTaskCommands` already produces, `liveMarkdownPlugin`'s existing `TaskMarker` handling (which recognizes the trailing `<!-- task:<uuid> -->` comment and renders a live, clickable checkbox wired to `toggleTaskComplete`) picks it up automatically — **no new rendering code needed for the result**, only for triggering the creation.

### Error Handling & Edge Cases

- Blank/whitespace-only line: no-op, nothing dispatched.
- Line is entirely tags (e.g. "#errands #shopping"): falls back to the original trimmed text as the title, same as `extractAndStripTags`'s existing "never leave an empty title" guarantee.
- Line already is a task checkbox (has a `<!-- task:<uuid> -->` marker): the button still fires and would double-wrap it into a second task. Not specially guarded against — same trust-the-user posture as the rest of this editor's toolbar (nothing stops you from bolding already-bold text either).
- Task creation fails server-side: `result.ok` is false, nothing is dispatched, the line is left untouched — no partial/garbled state.

### Testing Approach

- **Unit tests**: `formatTaskCheckboxLine` (with/without due date, with/without tags, multiple tags).
- **Manual verification**: type a line with a date and a tag, place the cursor on it, click the new toolbar button; confirm the line becomes a checked-off-able checkbox, the task appears on `/tasks` with the right due date and tag, and toggling the checkbox in either place stays in sync.
- Full existing suite must stay green.

## Part 2 — In-Note Date Detection → "Create Event?"

### Design

**`lib/jotter/dispatch.ts`**: `DEFAULT_EVENT_DURATION_MS` (currently a private `const`) becomes `export const` — this is the same 1-hour fallback `AddEventDialog` and Jotter's implicit routing already use when a detected date has no explicit end, and the new plugin needs the identical value rather than a second hardcoded copy.

**`lib/actions/events.ts`** gains, alongside `insertEventCore`:
```ts
export async function createEventFromNoteTextCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  lineText: string
): Promise<{ ok: boolean; eventId: string | null }> {
  const { title, dueAt, endAt } = parseQuickAdd(lineText.trim());
  if (!title || !dueAt) return { ok: false, eventId: null };
  const result = await insertEventCore(supabase, userId, {
    title,
    startAt: dueAt.toISOString(),
    endAt: (endAt ?? new Date(dueAt.getTime() + DEFAULT_EVENT_DURATION_MS)).toISOString(),
  });
  return { ok: result.ok, eventId: result.eventId };
}

export async function createEventFromNoteText(lineText: string) {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { ok: false, eventId: null };
  const result = await createEventFromNoteTextCore(supabase, userId, lineText);
  if (result.ok) {
    revalidatePath("/calendar");
    revalidatePath("/tasks");
  }
  return result;
}
```
Same `parseQuickAdd` reuse as Part 1 — the title is the line with the matched date phrase stripped out, exactly like quick-add's own title derivation.

**`components/notes/editor/dateDetectionPlugin.ts`** (new) — structured like `lineEmbedPlugin.ts`: for every visible line not touched by the current selection (so a line being actively typed on isn't interrupted), run `chrono.parse(line.text, referenceDate, { forwardDate: true })`. On a match:
- If the line already contains an `<!-- event:<uuid> -->` marker, hide the marker text and render a small inert "✓ Event created" badge instead of a button (idempotency, mirroring `TASK_MARKER_COMMENT`'s exact role in `liveMarkdownPlugin`).
- Otherwise, mark the matched span (subtle underline) and append a widget decoration right after it: a small "Create event?" button.

Clicking the button doesn't do the async work itself — like `onWikilinkClick`, it calls a callback threaded down from `NoteEditor.tsx` via a new `NoteBodyEditor` prop, `onCreateEvent?: (lineText: string, markerInsertPos: number) => void`, passing the line's current text and the absolute doc position right after the matched date span. `NoteEditor.tsx`:
```ts
function handleCreateEventFromLine(lineText: string, markerInsertPos: number) {
  startTransition(async () => {
    const result = await createEventFromNoteText(lineText);
    if (result.ok && result.eventId) {
      withView((view) =>
        view.dispatch({ changes: { from: markerInsertPos, to: markerInsertPos, insert: `<!-- event:${result.eventId} -->` } })
      );
    }
  });
}
```
The marker is only written after the server confirms the event exists — unlike the checkbox widget's optimistic local toggle, there's a real server-generated id to embed, so the doc mutation has to wait for the round trip.

### Error Handling & Edge Cases

- Date phrase inside an already-processed `/task create` command line: `findTaskCommands`/`processNoteTaskCommands` only fire on save and only match lines starting with `/task create`; the date-detection plugin runs independently at render time and would still offer to create a standalone event alongside the linked task. Accepted as a minor overlap rather than special-cased — the two features solve different problems (a due-dated task vs. a calendar event) and a user typing `/task create "..."` is already past the point of wanting a date-detection prompt.
- Ambiguous/ low-confidence chrono matches (e.g. a lone number that could be a date): same false-positive risk `parseQuickAdd` already accepts everywhere else in this app; no additional confidence filtering.
- Event creation fails server-side: no marker inserted, the button stays clickable, next click retries.
- Line edited after the button renders but before it's clicked: the click handler reads `line.text` fresh at click time (via the ref-backed closure, same as every other menu/handler in this editor), so it always acts on current text, not stale text from when the decoration was built.

### Testing Approach

- **Unit tests**: none new beyond what `parseQuickAdd`/`chrono-node` already cover — this part is wiring, not new parsing logic.
- **Manual verification**: type "Standup tomorrow 9am" on its own line, confirm the date phrase gets underlined and a "Create event?" button appears; click it, confirm the event shows up on `/calendar` with a 1-hour default duration and the button is replaced with a checkmark; reload the note and confirm the checkmark (not a fresh button) still shows.
- Full existing suite must stay green.

## Part 3 — Live Embedded Queries

### Design

**`lib/jotter/parseEmbeddedQuery.ts`** (new, pure):
```ts
export interface EmbeddedQuery {
  pillar: "task" | "note";
  tag?: string;
  status?: "open" | "done"; // tasks only
  due?: "today" | "overdue" | "week"; // tasks only
}

const QUERY_LINE = /^\?(tasks|notes)(?:\s|$)(.*)$/i;

export function parseEmbeddedQuery(line: string): EmbeddedQuery | null {
  const match = line.trim().match(QUERY_LINE);
  if (!match) return null;
  const pillar = match[1].toLowerCase() === "tasks" ? "task" : "note";
  const rest = match[2];
  const tag = rest.match(/#([a-zA-Z][\w-]*)/)?.[1]?.toLowerCase();
  if (pillar === "note") return { pillar, tag };
  const status = rest.match(/status:(open|done)/i)?.[1]?.toLowerCase() as "open" | "done" | undefined;
  const due = rest.match(/due:(today|overdue|week)/i)?.[1]?.toLowerCase() as "today" | "overdue" | "week" | undefined;
  return { pillar, tag, status, due };
}
```
Requires the keyword immediately after `?` (`?tasks`, not `? tasks`), so a stray line of prose starting with a literal question mark essentially never collides.

**`lib/jotter/runEmbeddedQuery.ts`** (new, pure) — filters an in-memory snapshot, reusing `groupTasksByDueDate` for the `due:` filter rather than inventing new thresholds:
```ts
export interface QueryableTask { id: string; title: string; completed_at: string | null; due_at: string | null; tags: string[] }
export interface QueryableNote { id: string; title: string; tags: string[] }

const RESULT_LIMIT = 10;

export function runEmbeddedQuery(
  query: EmbeddedQuery,
  data: { tasks: QueryableTask[]; notes: QueryableNote[] }
): { items: (QueryableTask | QueryableNote)[]; totalCount: number } {
  if (query.pillar === "note") {
    const matches = query.tag ? data.notes.filter((n) => n.tags.includes(query.tag!)) : data.notes;
    return { items: matches.slice(0, RESULT_LIMIT), totalCount: matches.length };
  }

  let matches = query.tag ? data.tasks.filter((t) => t.tags.includes(query.tag!)) : data.tasks;
  if (query.status) matches = matches.filter((t) => (query.status === "done") === (t.completed_at !== null));
  if (query.due) {
    const groups = groupTasksByDueDate(matches);
    matches = query.due === "overdue" ? groups.overdue : query.due === "today" ? groups.today : [...groups.today, ...groups.thisWeek];
  }
  return { items: matches.slice(0, RESULT_LIMIT), totalCount: matches.length };
}
```

**`components/notes/editor/embeddedQueryPlugin.ts`** (new) — same whole-line replace structure as `lineEmbedPlugin.ts`: a line matching `parseEmbeddedQuery` (and not touched by the current selection, so it stays editable) gets replaced with a widget rendering a small `<ul>`:
- Task rows: a checkbox (same visual treatment as `liveMarkdownPlugin`'s `CheckboxWidget`, wired to a new `onToggleQueryTask` callback) + title + due-date badge (reusing `formatRelativeDays`).
- Note rows: a plain `<a href="/notes/{id}">` — a real anchor, not a CM6 click-intercept, so it works the same way `YoutubeEmbedWidget`'s "Edit link" button already does independent of `ignoreEvent`.
- Zero matches: "No matching tasks." / "No matching notes." placeholder, same tone as `LinkedNotesPicker`'s empty state.
- More than 10 matches: a trailing "+N more" line, plain text, no link.

**`components/notes/NoteBodyEditor.tsx`**: two new props, `queryableTasks: QueryableTask[]` and `queryableNotes: QueryableNote[]`, threaded into `createEmbeddedQueryPlugin(getQueryableTasks, getQueryableNotes, onToggleQueryTask)` via the same fresh-ref pattern every other live-data plugin here already uses.

**`components/notes/NoteEditor.tsx`**: receives `queryableTasks`/`queryableNotes` as new props and defines:
```ts
function handleToggleQueryTask(taskId: string, checked: boolean, dueAt: string | null) {
  startTransition(async () => {
    await toggleTaskComplete(taskId, checked, dueAt);
    router.refresh();
  });
}
```
This is deliberately **not** the same as `handleToggleLinkedTask` (no refresh). A linked task's checkbox already updates live today because `toggleTaskComplete` (per the Tier 1 spec) revalidates every note path that task is linked to — which includes the current note, since it's linked. A task surfaced only through a query has no such guarantee (it may not be linked to this note at all), so its checkbox explicitly refreshes the current route after the toggle resolves, keeping the query's live view actually live for the note you're looking at.

**`app/(app)/notes/[noteId]/page.tsx`**: two new queries, both scoped to the signed-in user (no per-note filtering — a query can reference *any* of the user's tasks/notes, not just ones linked to this one):
```ts
supabase.from("tasks").select("id, title, completed_at, due_at, taggables(tags(name))"),
supabase.from("notes").select("id, title, taggables(tags(name))"),
```
mapped into `QueryableTask[]`/`QueryableNote[]` shape (flattening the nested `tags(name)` join into a `tags: string[]` array), passed to `NoteEditor` as `queryableTasks`/`queryableNotes`.

### Error Handling & Edge Cases

- Unknown/malformed filter token (e.g. `?tasks status:blocked`): `parseEmbeddedQuery` simply doesn't match that token — an unrecognized `status:` value is left `undefined`, meaning the status filter is silently skipped rather than erroring; the query still runs on the tag/due filters it did understand.
- `due:` or `status:` on a `?notes` query: parsed but ignored (`if (pillar === "note") return { pillar, tag }` never looks at them) — matches this app's "never block on a malformed detail" posture elsewhere (`parseQuickAdd`, `extractAndStripTags`).
- A query line inside an active/selected line: shows raw text, same as any other live-preview construct in this editor — you can always see and edit exactly what you typed.
- Fetching every task/note (with tags) on every note page load: consistent with this app's existing personal-scale assumption (no pagination, no index added for `taggables` beyond what already exists) — the same tables are already fetched in full on the Tasks and Notes list pages today.

### Testing Approach

- **Unit tests**: `parseEmbeddedQuery` (each filter token, combinations, unknown tokens, `?notes` ignoring task-only filters, non-matching lines); `runEmbeddedQuery` (tag filter, status filter, each `due:` bucket, result-limit truncation with `totalCount`).
- **Manual verification**: tag a couple of tasks and notes with `#test-query`; add a `?tasks #test-query` line and a `?notes #test-query` line to a note; confirm both render the right items; check off a task from the query's own checkbox and confirm it visually updates (strikethrough) without a manual page reload; add `status:done` and `due:today` variants and confirm the buckets are right.
- Full existing suite must stay green.
