# Jotter: Unified Command Box — Design Spec

**Date:** 2026-08-23
**Status:** Approved for planning

## Summary

A single text box, reached from anywhere via the existing Cmd/Ctrl+K palette, that acts across all three pillars instead of just searching them. Plain text keeps today's search behavior unchanged; a leading `/` switches the same box into command mode to create a task, event, or note without navigating away from wherever you are. Ships alongside event&harr;task linking — an event can optionally have a companion task that stays in sync with it — since that's the piece that makes cross-pillar unification tangible rather than cosmetic.

This is the app's flagship interaction: one box, three pillars, no new page to learn.

## Goals

- Give the app an unmistakably "mix-match" interaction that's the first thing a new user notices.
- Implicit mode (no prefix) feels identical to today's task quick-add for the common case — this is additive to `parseQuickAdd`, not a new grammar users must learn.
- Explicit `/` mode is an escape hatch for power users and for actions where guessing intent would be unsafe (currently: none in v1, since v1 is create-only, but the grammar is designed to carry Phase 2 actions without changing shape).
- Event-task linking showcases real interconnection: rescheduling or reminding on one flows to the other automatically, no extra user action.

## Non-Goals (v1)

- Editing existing tasks/events/notes via Jotter (Phase 2)
- Subtask creation via Jotter (Phase 2)
- Note-to-task or note-to-note linking syntax via Jotter (Phase 2)
- Recurrence syntax (already Phase 2 in the original spec; unchanged here)
- A general settings page — v1 ships exactly one new preference, not a settings surface to grow into

## Architecture

**Where it lives:** merged into the existing Cmd/Ctrl+K `GlobalSearch` component rather than a second overlay or shortcut. Behavior forks on the first character: no `/` &rarr; existing search, unchanged. Leading `/` &rarr; the same palette switches into command mode. One shortcut, one mental model, less to remember than "search is one key, create is another."

**Command mode UI:** reuses cmdk's list/item primitives already wired up in `GlobalSearch` (including the `shouldFilter={false}` + explicit `value` pattern already required for pre-filtered results). Typing `/` alone opens a pillar menu (Task / Event / Note); picking one (or typing `/task`, `/event`, `/note` directly) opens that pillar's action menu — v1 has exactly one action per pillar, `create`; selecting it drops a snippet-style template into the input with the cursor placed in the title slot.

**Parsing:** both implicit and explicit modes run the free-text portion through the same `parseQuickAdd` (chrono-based) date/time extraction and the same tag extractor already used by quick-add and notes. No second date parser, no second tag grammar.

## Implicit Routing Rules

Applied when the input does **not** start with `/`. Each row is checked in order; the first match wins.

| Signal | Routes to |
|---|---|
| No date/time found, short single-line phrase | **Task**, no due date — today's exact quick-add behavior |
| Date/time found, no time range, short single-line phrase | **Task**, with due date — today's exact quick-add behavior |
| A time *range* is found (two times, or an explicit duration like "for 1 hour") | **Calendar Event** |
| No date/time found, long or multi-line input | **Note** |

"No signal fires" is impossible by construction — the first two rows already cover today's entire quick-add behavior, so implicit mode is a strict superset of what exists today. The only genuinely new inference is the Task/Event split on time-range detection.

**Ambiguity guard:** when routing lands on the Task/Event boundary, show a small inline Task / Event / Note pill row live as the user types, so a wrong guess is a one-click fix rather than a silent miscategorization.

## Explicit Syntax Grammar

```
/<pillar> create "<primary>" [<date/time>] [#tag ...]
```

```
/task create "call mom" tomorrow 5pm #family
/event create "team sync" tomorrow 2-3pm
/note create "grocery list" "milk, eggs, bread"
```

Quotes are only required where the primary argument would otherwise be ambiguous against the trailing date/tag tokens — same convention as today's quick-add bar, so explicit mode isn't meaningfully slower to type than implicit mode. `create` is the only action in v1; the grammar's `<pillar> <action> <args>` shape is chosen so Phase 2 actions (`edit`, `add-subtask`, `link`, ...) slot in without a breaking change.

## Event&harr;Task Linking

The feature that makes "one box, three pillars" real rather than cosmetic.

- `events.linked_task_id` — nullable FK to `tasks.id`, `on delete set null`.
- Creating an event with "also add as a task" enabled creates a companion task: `title` = event title, `due_at` = event `start_at`.
- Rescheduling the event (drag on the calendar, or editing start/end) shifts the linked task's `due_at` by the same delta and re-runs the existing `syncTaskReminder`, reusing the reschedule/reminder-sync code paths that already exist rather than adding a parallel sync mechanism.
- Completing the task never touches the event — they're peers, not one subsuming the other. Deleting the task only clears `linked_task_id`; the event is untouched.
- Deleting an event with a linked task prompts for a choice — delete the task too, or keep it standalone — the same "never silently orphan" pattern already used for folder deletion.
- On the calendar, a task linked to an event is suppressed from the day cell's separate "tasks due" list (the event chip already represents it) and instead gets a checkbox inside the event chip's popover. Checking it there is wired to the exact same server action as checking it from `/tasks` — same code path, not a parallel one, so it "feels identical" by construction rather than by careful UI mimicry.

## Settings (new, minimal)

- A `profiles` table keyed by `user_id`, with `default_event_creates_task boolean default false`.
- A lightweight settings surface off the top nav to toggle it — v1 scope is this one preference, not a settings page to grow into.
- `AddEventDialog` pre-checks/unchecks its "also add as a task" checkbox from this default and allows a per-event override. Jotter's terse `/event create` always respects the default with no inline override token — keeps the command grammar short for what's normally a set-and-forget preference; a per-event override still goes through the full dialog.

## Notes via Jotter

Both `/note create "title" "content"` and implicit long-form routing create the note at root/unfiled — identical to clicking "+ note" at the root today. No folder-targeting syntax in v1; move the note afterward via the existing move-to picker.

## Error Handling & Edge Cases

- **Task/Event ambiguity:** inline pill row to disambiguate, never a silent wrong guess (see Implicit Routing Rules).
- **No date/time found anywhere:** falls back to a Task with no due date (short input) or a Note (long input) — never blocks submission, matching the original spec's quick-add principle.
- **Malformed explicit command** (bad quoting, missing required argument): inline error in the palette; input stays editable rather than being cleared.
- **Event deletion with a linked task:** explicit prompt, never silent orphaning (see Event&harr;Task Linking).

## Testing Approach

- **Unit tests:** implicit-routing decision-table cases, especially the Task/Event range-detection boundary; explicit-syntax parsing (quoting, tag/date extraction reusing the existing extractors).
- **Integration tests:** linked-task creation/reschedule/delete sync against a real Supabase instance — extends the existing reschedule and reminder-sync integration coverage rather than standing up a new suite.
- **E2E:** extend the existing full-flow suite (or add a companion spec) to open the palette via its keyboard shortcut, run `/event create ...` with linking enabled, confirm both the event and its linked task appear correctly, then drag the event and confirm the task's due date and reminder moved with it.

## Open Questions for Implementation Planning

- None blocking — Phase 2 items (edit/subtask/note-linking syntax, per-event override tokens in the terse grammar) are intentionally deferred, not undecided.
