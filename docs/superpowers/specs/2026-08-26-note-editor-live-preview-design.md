# Note Editor: Live Preview — Design Spec

**Date:** 2026-08-26
**Status:** Approved for planning

## Summary

Replaces the note editor's current split view (a raw-markdown `<textarea>` next to a separate rendered-HTML preview pane) with a single CodeMirror 6 surface that renders markdown richly *while you type*, the same mechanism Obsidian's own "Live Preview" is built on. Adds three Obsidian-style capabilities on top of that foundation: collapsible headings, `[[wikilinks]]` with a backlinks panel (finally wiring up the `note_links` table that's sat unused in the schema since Milestone 1), and YouTube embeds.

## Goals

- Notes look the way they'll actually read while you're writing them, not just in a separate pane.
- Build this the way Obsidian actually builds it (CodeMirror 6's decoration/widget APIs) rather than approximating the effect with a textarea + overlay hack — folding and embeds don't work well that way (see the design conversation's Option 2/3 comparison).
- Wire up cross-note linking using schema that already exists, at no migration cost.
- Keep `notes.body_markdown` as the one source of truth. No data-model change, so everything already built on top of it — note-embedded Jotter `/task create` syntax, hashtag extraction — keeps working completely unmodified.

## Non-Goals (this pass)

- A Source / Live-Preview / Reading three-mode toggle (Obsidian has one) — one unified editing surface only.
- Persisting fold state across sessions (starts fully expanded every time a note opens).
- Embed types beyond YouTube — images already render via standard markdown; the mechanism is built to extend to more platforms later without a rewrite.
- Rename cascade: renaming a note does not update `[[Old Title]]` references in other notes.
- Robust duplicate-note-title disambiguation beyond "most recently edited wins."

## Architecture

| | Today | New |
|---|---|---|
| Storage | Plain text in `notes.body_markdown` | Unchanged |
| Editor | `<textarea>` (`components/notes/NoteBodyEditor.tsx`) + separate `react-markdown` preview pane | Single CodeMirror 6 surface replaces both; the preview column is removed from `NoteEditor.tsx`'s layout entirely |
| Note-embedded Jotter syntax, hashtag extraction | Operate on raw `body_markdown` text | Unchanged — the stored text hasn't changed shape |

CodeMirror 6 is the actual technology Obsidian's Live Preview is built on. Its `@codemirror/lang-markdown` package provides a real (Lezer-based, GFM-aware) markdown parser; on top of that, a set of `ViewPlugin`/`Decoration` extensions handle:

- Hiding syntax markers (`**`, `#`, etc.) and rendering styled marks in their place, *except* on whichever line the cursor currently occupies, where the raw syntax reveals itself for editing. This cursor-aware reveal/hide is the core of the "Live Preview" feel.
- Replacing a bare YouTube-URL line with an embedded-player `WidgetDecoration`.
- Rendering `[[wikilink]]` syntax as a styled, clickable span (distinct styling for a link to an existing note vs. a broken one).
- Heading fold indicators, built on CM6's existing code-folding support, adapted to fold by markdown heading level instead of code blocks.

## Data Model

`note_links` already exists (created in Milestone 1, unused until now) and needs no migration:

```
note_links (id, user_id, source_note_id, target_note_id, created_at)
```

RLS owner-scoped, `unique(source_note_id, target_note_id)` — the same shape as `task_note_links`. On save, the set of `[[Title]]` references currently in `body_markdown` is resolved to note ids and `note_links` for that source note is made to match exactly (missing links added, stale ones removed). This is a deliberate difference from how `#tags` behave: tags never auto-remove on save because they're also manually assignable via the tag picker, but wikilinks have no separate assignment UI — the text is the only source of truth for what a note links to, so the sync should be exact in both directions. Implemented as a `syncNoteLinksCore(supabase, userId, noteId, body)` helper following the same core/wrapper split used everywhere else in this codebase (callable from `saveNote` and directly from integration tests, since it can't go through `currentUserId()`'s `next/headers` dependency).

## Feature Scope

**1. Live rendering of standard markdown** — headings, bold/italic/strikethrough, bullet & numbered lists, task checkboxes, code blocks/inline code, blockquotes, GFM tables, horizontal rules, and regular `[text](url)` links, all styled live with cursor-aware raw-syntax reveal on the active line.

**2. Collapsible headings** — a fold indicator next to any heading collapses everything until the next heading of equal-or-higher level. Fold state is ephemeral (per-session, not saved).

**3. Wikilinks & backlinks**
- Typing `[[` opens an autocomplete of the user's note titles, reusing the same caret-position-menu mechanism already built for the `/task create` slash-menu (`lib/dom/getCaretCoordinates.ts`).
- Selecting inserts `[[Note Title]]`; renders as a distinctly-styled clickable link that navigates to that note.
- A broken link (`[[Note That Doesn't Exist]]`) renders distinctly (e.g. dashed underline); clicking it creates a new note with that title via the existing `insertNoteCore`, and the link resolves the next time the source note is saved.
- A small "Backlinks" section in the note header (same pattern as the existing "Linked tasks" section) lists notes that link to the current one.

**4. YouTube embeds** — a line containing *only* a YouTube URL (watch/youtu.be/embed formats) renders as an embedded player instead of a bare link. Built as a small extensible "bare URL on its own line → widget" registry rather than a YouTube-specific one-off, so adding more platforms later doesn't mean a rewrite.

**5. Smarter task checkboxes** — `- [ ]` renders as a real checkbox. A line created by `/task create` (linked to a real task via `task_note_links`) toggles that task's actual completion when checked, reusing `toggleTaskComplete` verbatim — the same code path as the existing "Linked tasks" checkbox. A checkbox typed by hand with no linked task just toggles the markdown text locally.

## Error Handling & Edge Cases

- **Duplicate note titles**: a `[[wikilink]]` resolves to the most recently edited note with that title.
- **Non-existent wikilink target**: renders as a broken link rather than erroring; click-to-create per above.
- **Renaming a note**: intentionally does not cascade (see Non-Goals) — other notes' `[[Old Title]]` references go stale until manually fixed.
- **Malformed wikilink syntax** (e.g. an unterminated `[[`): never treated as a link until properly closed; doesn't block rendering of the rest of the note.

## Testing Approach

- **Unit tests**: wikilink parsing/resolution logic, YouTube URL matching across its common formats.
- **Integration tests**: `note_links` sync-on-save against real Supabase, mirroring the existing `task_note_links` test pattern (creation, exact-match sync on edit, cross-user RLS isolation).
- **Manual/e2e verification**: folding, cursor-aware syntax reveal, and embeds are inherently visual/interactive — verified by hand in the browser, consistent with how the rest of this session's interactive UI work (the slash-menu, drag-and-drop) was verified.

## Open Questions for Implementation Planning

- None blocking — the Non-Goals above are intentionally deferred, not undecided.
