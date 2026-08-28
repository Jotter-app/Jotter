# Line-to-Task, In-Note Date Detection, and Live Embedded Queries — Design Spec

**Date:** 2026-08-28
**Status:** Approved for planning

## Summary

Tier 2 of the cross-pillar interconnectivity roadmap: three editor-level features, all extensions of the same CodeMirror plugin architecture the note body editor already uses (`wikilinkPlugin.ts`, `liveMarkdownPlugin.ts`, `lineEmbedPlugin.ts` in `components/notes/editor/`), plus the `chrono-node` date parsing this app already ships for quick-add.

1. **Line-to-task** — a new toolbar button converts the current line into a linked task in place, reusing the exact checkbox+marker format `processNoteTaskCommands` already produces for `/task create` lines.
2. **In-note date detection** — typing a date/time phrase on its own decorates it with a "Create task?" prompt; clicking it runs the exact same whole-line-to-checkbox conversion as Part 1, just triggered by a detected date instead of a manual toolbar click. (Originally scoped as "creates a standalone event" — revised to create a task instead, since a due-dated task already surfaces on both `/tasks` and `/calendar`, while a standalone event only ever showed up on the calendar and had no note link.)
3. **Live embedded queries** — a `?tasks #tag` / `?notes #tag` line renders a live, filtered list of matching tasks or notes directly in the editor, Dataview-style.

None of these need new tables. Query filtering runs against the same kind of page-loaded snapshot (`allNoteTitles`, `linkedTasks`, etc.) the editor already uses for wikilink autocomplete and linked-task checkboxes — not a live subscription.

## Goals

- Converting a line of prose (or a detected date within one) into a real, linked task takes one click, no retyping.
- A note can show a live, filtered view of tasks or notes elsewhere in the app without leaving the editor.
- Every new interaction reuses an existing CM6 extension pattern, existing creation logic (`insertTaskCore`, `createTaskFromNoteLine`), and the existing task-marker idempotency convention — no parallel creation paths.

## Non-Goals

- **No event creation from the note editor at all.** Date detection creates a task, not an event — see Part 2. `events` still has no `linked_note_id` column (that's Tier 3, alongside meeting-note generation and the post-meeting debrief); this doc no longer needs that gap, since nothing here creates events anymore.
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

## Part 2 — In-Note Date Detection → "Create Task?"

### Design

Deliberately **not** a parallel creation path: clicking the prompt runs the exact same whole-line-to-checkbox conversion Part 1's toolbar button already does (`createTaskFromNoteLine` → `formatTaskCheckboxLine`). The only thing this part adds is a *second trigger* for that conversion — a decoration that reacts to a detected date instead of requiring a manual click — plus the guard that keeps the two triggers from fighting each other.

**`components/notes/editor/dateDetectionPlugin.ts`** (new) — structured like `lineEmbedPlugin.ts`: for every visible line not touched by the current selection (so a line being actively typed on isn't interrupted) and not already a task checkbox line, run `chrono.parse(line.text, referenceDate, { forwardDate: true })`. On a match, mark the matched span (subtle dashed underline) and append a widget decoration right after it: a small "Create task?" button.

The "already a task checkbox line" guard (`/^\s*-\s*\[[ xX]\]/`) is what makes this safe to compose with Part 1: once a line is converted, its own `(due Aug 29, 2:00 PM)` suffix would otherwise look like a fresh, unrelated date match on re-render and offer to convert the same line again. Skipping any line that already starts with `- [ ]`/`- [x]` avoids that — and doubles as this feature's idempotency mechanism, replacing the separate `<!-- event:<uuid> -->` marker/checkmark-badge scheme the standalone-event version needed (not needed here: once converted, the line simply stops matching the plugin's own trigger).

Clicking the button doesn't do the async work itself — like `onWikilinkClick`, it calls a callback threaded down from `NoteEditor.tsx` via a `NoteBodyEditor` prop, `onCreateTaskFromDate?: (lineFrom: number, lineTo: number, lineText: string) => void`, passing the *whole line's* current range and text (not just the matched date span — the conversion replaces the entire line, same as Part 1). `NoteEditor.tsx`:
```ts
function handleCreateTaskFromDate(lineFrom: number, lineTo: number, lineText: string) {
  startTransition(async () => {
    const result = await createTaskFromNoteLine(note.id, lineText);
    const replacementLine = result.replacementLine;
    if (!result.ok || !replacementLine) return;
    withView((view) => view.dispatch({ changes: { from: lineFrom, to: lineTo, insert: replacementLine } }));
  });
}
```
This is Part 1's `handleCreateTaskFromLine` in every way except where `lineFrom`/`lineTo`/`lineText` come from: Part 1 reads them from the cursor position at click time, this reads them from the plugin's detected line at click time.

### Error Handling & Edge Cases

- Date phrase inside an already-processed `/task create` command line: that line already starts with `- [ ]` by the time `processNoteTaskCommands` runs on save, so the checkbox-line guard excludes it from date detection too — no double-prompt.
- Ambiguous/low-confidence chrono matches (e.g. a lone number that could be a date): same false-positive risk `parseQuickAdd` already accepts everywhere else in this app; no additional confidence filtering.
- Task creation fails server-side: nothing is dispatched, the line (and its date-detection prompt) is left exactly as it was — next click retries.
- Line edited after the button renders but before it's clicked: the click handler reads the line fresh at click time (via the ref-backed closure, same as every other menu/handler in this editor), so it always acts on current text, not stale text from when the decoration was built.
- A line with a date phrase *and* other content (e.g. "Meeting with the team tomorrow 3pm to discuss Q4 planning"): converts the whole line, same as Part 1's own accepted trade-off — the date moves into the checkbox's `(due ...)` suffix rather than staying inline, and the rest of the sentence becomes the task title.

### Testing Approach

- **Unit tests**: none new beyond what Part 1 and `chrono-node` already cover — this part is a second trigger for existing conversion logic, not new parsing.
- **Manual verification**: type "Standup tomorrow 9am" on its own line, confirm the date phrase gets underlined and a "Create task?" button appears; click it, confirm the line becomes a checkbox, the task appears on both `/tasks` and `/calendar` with the right due date, and it's linked to the note (shows in "linked to N tasks"); confirm the converted line's own `(due ...)` text does *not* get a second prompt.
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
