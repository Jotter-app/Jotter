# Hide Note-Only Tags From Tasks — Design Spec

**Date:** 2026-08-26
**Status:** Approved for planning

## Summary

Tags are a single per-user vocabulary shared between notes and tasks (one `tags` row, attached to either via the polymorphic `taggables` join). As note-tagging grows, note-only tags increasingly clutter the Tasks page's tag filter row and per-task tag picker, even though they're never relevant there. This adds an opt-in setting that hides any tag not currently attached to at least one task from the Tasks page entirely, so the two views can develop separate-feeling tag vocabularies. A companion tags section on the Notes page gives note tags their own home and their own delete affordance, so hiding a tag from Tasks never leaves it unmanageable.

## Goals

- A per-user setting, off by default, that — when on — hides from the Tasks page any tag with zero current task attachments.
- Hiding applies to both the tag-filter pill row and each task's "+ tag" picker suggestions, so note tags stop surfacing anywhere in the Tasks-tagging flow, not just the passive list.
- A new collapsed-by-default tags section at the top of the Notes page, listing every tag currently attached to at least one note, each deletable from there.
- A tag can always be fully deleted from wherever it's currently visible (Tasks page when task-attached, Notes page when note-attached) — hiding a tag from Tasks never strands it without a delete path.

## Non-Goals

- No change to how tags are created, colored, or assigned — `TagPicker`, `findOrCreateTag`, `createAndAssignTag`/`assignExistingTag`/`unassignTag` are untouched.
- No tag-based filtering on the Notes page — the new section is a management/delete surface, not a "filter notes by tag" control (the Notes page has no note-filtering UI today, and this doesn't add one).
- No per-tag manual override — "note-only" is purely computed from current `taggables` rows (zero task attachments), per the earlier decision; nothing persists a tag's "type" independent of its actual usage.
- No change to `deleteTagGlobally`'s semantics — it still deletes the tag everywhere (cascading through `taggables`), from either surface.

## Architecture

| | Mechanism | Why |
|---|---|---|
| Setting storage | New `profiles.hide_note_only_tags_from_tasks boolean not null default false` column, via migration | Mirrors the existing `default_event_creates_task` column on the same table exactly — same per-user settings row, same upsert-on-write pattern. |
| Setting read/write | `lib/actions/settings.ts`: `getHideNoteOnlyTagsCore`/`getHideNoteOnlyTags`/`updateHideNoteOnlyTags` | Copies `getDefaultEventCreatesTaskCore`/`getDefaultEventCreatesTask`/`updateDefaultEventCreatesTask`'s exact core/wrapper shape. |
| Settings UI | New `components/settings/HideNoteOnlyTagsToggle.tsx`, added to `app/(app)/settings/page.tsx` | Copies `DefaultEventCreatesTaskToggle`'s exact shape (checkbox + label + helper text, optimistic local state, upsert on change). |
| Tasks-page filtering | `app/(app)/tasks/page.tsx` computes the set of tag IDs with ≥1 `taggable_type: "task"` row from the `taggables` query it already fetches — no new query. When the setting is on, `allTags` is filtered to that set before being passed to `TagFilterRow` and each `TaskRow`. | The task-scoped `taggables` join is already fetched today (for `tagsByTaskId`); deriving the "has ≥1 task attachment" set from it is free. Filtering the one `allTags` variable that feeds both the filter row and every `TaskRow`'s `TagPicker` covers both surfaces with one change. |
| Notes-page tags section | New `components/notes/NoteTagsSection.tsx`, wired into `app/(app)/notes/page.tsx`, which adds a `taggables` (`taggable_type: "note"`) query alongside its existing folders/notes fetch and dedupes into a unique tag list | Mirrors `TagFilterRow`'s delete mechanism (`ConfirmDeleteButton` + `deleteTagGlobally`) but as a `<details>`/`<summary>` collapsible section (matching the Tasks page's existing Completed/Archived sections), since the Notes page has no filter-row precedent to extend. |

No changes to `tags`, `taggables`, or any server action beyond the new settings pair.

## Feature Scope

**1. Settings toggle** — label "Hide tags that aren't used on any task", helper text "When on, a tag only shows up on the Tasks page once it's actually attached to a task -- note-only tags stay out of the way there (they're still manageable from the Notes page)." Default off, in Settings next to the existing event/task toggle.

**2. Tasks page** — when the setting is on: a tag with zero `taggable_type: "task"` rows is excluded from both `TagFilterRow`'s pills and every `TagPicker`'s suggestion list on that page. Typing a hidden tag's exact name into a task's "+ tag" picker still works (via `findOrCreateTag`'s find-or-create semantics) — it reuses the existing tag rather than erroring or creating a duplicate; it just won't appear as a suggestion.

**3. Notes page tags section** — a `<details>` block at the top of the page (above the folder tree, below the page header), default collapsed, titled "Tags" with a count. Lists every tag with ≥1 `taggable_type: "note"` row as a pill (tag color, name, "×" delete button using the same `ConfirmDeleteButton` + `deleteTagGlobally` flow as the Tasks page's filter row). Renders nothing (not even the collapsed shell) when there are no note tags, matching `TagFilterRow`'s empty-state behavior. Pills are not links — there's no per-tag note filtering to link to.

## Error Handling & Edge Cases

- A tag attached to both a note and a task: stays visible on the Tasks page regardless of the setting (it has a task attachment), and also appears in the Notes tags section (it has a note attachment). Deleting it from either surface removes it everywhere, same as today.
- A brand-new tag with zero attachments of either kind (shouldn't normally happen, since creating a tag always assigns it to something at creation time): would be hidden from Tasks when the setting is on and absent from the Notes section too, until it's attached to something.
- Turning the setting on with no note-only tags yet: no visible change until a note-only tag exists.
- Deleting the last note attachment of a shared (note+task) tag: it drops out of the Notes tags section on next load but stays visible on Tasks (still task-attached) — no special handling needed, this falls out of the existing computed-membership approach.

## Testing Approach

- **Unit/integration tests**: `getHideNoteOnlyTagsCore`/`updateHideNoteOnlyTagsCore` (read default, round-trip write, upsert-creates-row-if-missing, mirroring the existing settings tests if any exist for the event-creates-task setting). Tasks-page tag-filtering logic covered as a small pure function if extracted, or via an integration-style check that a note-only tag's id is excluded from the filtered set.
- **Manual verification**: create a note-only tag and a task-only tag; confirm the note-only tag appears in the Tasks filter row and task tag-picker before the setting is on, and disappears from both after turning it on; confirm it's still visible and deletable from the new Notes tags section while hidden from Tasks; confirm deleting it there removes it from the note it was attached to and (if re-enabled) from Tasks too; confirm a tag attached to both a note and a task remains visible in both places regardless of the setting.
