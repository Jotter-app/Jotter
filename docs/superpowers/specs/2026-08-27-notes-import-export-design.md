# Notes Import/Export (.md, with folders) — Design Spec

**Date:** 2026-08-27
**Status:** Approved for planning

## Summary

Lets notes move in and out of this app as plain `.md` files, folder structure and all — for backup, migration, or working with a note in another tool (Obsidian, a text editor) and bringing it back. Export covers everything, a single folder, or a single note; import accepts a `.zip` (preserving folders) or one or more loose `.md` files (landing at the root). Each file carries a small YAML-subset frontmatter block so tags and original timestamps survive a round trip, not just the body text.

## Goals

- A full backup/export of a user's notes, in a format that's still just plain markdown files if opened anywhere else.
- Re-importing an exported file (or folder of files) round-trips tags and created/updated timestamps, not just body text.
- Folder structure survives both directions — a zip's directory tree becomes real folders on import; folders become real directories on export.
- `[[wikilinks]]` between two notes imported in the same batch resolve correctly regardless of which file happened to import first.

## Non-Goals

- Editing an imported note's frontmatter through the UI — frontmatter is only ever machine-written (export) and machine-read (import), never hand-edited inside this app.
- Preserving `note_links`/backlinks as their own exported data — they're a derived cache of `[[wikilinks]]` already in the body text, so they regenerate correctly on import without needing their own representation in the file.
- Any conflict/merge UI for re-importing a note that already exists — per the earlier decision, notes always import as new rows (titles aren't unique in this app today), and folders are matched/reused by (name, parent) so re-importing into the same tree doesn't fork it.
- Full YAML support in the frontmatter parser — only the narrow subset this app itself writes (see Frontmatter Format below). The *output* is valid YAML so other tools read it fine; this app's own reader doesn't need to handle everything YAML allows.
- Importing non-`.md` files from a zip (images, attachments) — silently skipped for now.

## Architecture

| | Mechanism | Why |
|---|---|---|
| Export | `GET app/api/notes/export/route.ts` | A file download needs a real HTTP response (headers, binary body) — Server Actions return serialized RSC values, not that. Matches this app's one existing route-handler precedent (`app/api/push/subscribe`). Triggered by a plain `<a href>`; the browser handles the download, no client JS needed. |
| Import | `"use server"` action taking `FormData` | Server Actions accept `File` entries in `FormData` directly — no new route needed. Needs `experimental.serverActions.bodySizeLimit` raised past its 1MB default (a real vault zip can exceed that). |
| Zip read/write | `jszip` (new dependency) | One library for both directions. Nothing else in this app's dependency list touches zip or YAML. |
| Frontmatter | Hand-rolled reader/writer (`lib/notes/noteFrontmatter.ts`) | The format is fully self-controlled (this app is both the only writer and the primary reader), so a small, unit-tested, purpose-built parser is simpler and more in keeping with this codebase's existing taste (e.g. the note editor's hand-rolled CM6 wrapper over a packaged one) than a general YAML library. Written to be valid YAML regardless, so opening an exported file in another tool still shows sane frontmatter. |
| Folder resolution | `lib/notes/resolveFolderPath.ts` (new) | No existing helper resolves/creates a folder chain from a path — `collectDescendantFolderIds` (used by folder deletion) walks a tree top-down from a known id, the opposite direction from what import needs (given path segments, find-or-create each level). |

No schema changes — this reuses `notes`, `folders`, `tags`/`taggables`, and `note_links` exactly as they are.

## Frontmatter Format

```
---
title: "Note Title Here"
tags: ["tag-one", "tag-two"]
created: 2026-08-20T10:00:00.000Z
updated: 2026-08-26T09:00:00.000Z
---

Body markdown starts here.
```

- `title` and each tag are always double-quoted (internal `"` escaped as `\"`) — simplest way to stay valid YAML regardless of what characters a title contains, rather than conditionally quoting.
- `created`/`updated` are bare ISO-8601 timestamps (valid unquoted YAML scalars).
- A file with no frontmatter block (doesn't start with `---`) imports fine — the whole file is treated as the body, title falls back to the filename (minus `.md`), no tags, no dates (DB defaults apply).
- A file with a frontmatter block this parser doesn't recognize (e.g. hand-edited into invalid shape) falls back the same way rather than failing the whole import.

## Feature Scope

**1. Export** — `GET /api/notes/export?scope=all` / `?scope=folder&id=<id>` / `?scope=note&id=<id>`. Multi-note scopes (`all`, `folder`) return a `.zip` mirroring the folder tree, each note as `<sanitized-title>.md`; within a single directory, a title collision gets a `-2`, `-3`, ... suffix (a zip can't hold two same-named files in one directory — this is a filename concern, separate from the "notes can share a title" data-model fact). A single-note scope returns a bare `.md`, no zip wrapper. All scopes are owner-checked against the requesting user.

**2. Import** — a small client component with a file input (`.zip,.md`, multiple) submitting to the `importNotes` Server Action. Each uploaded `.zip` is expanded (only `.md` entries kept); each uploaded loose `.md` file is taken as-is at the root. For every resulting `(path, content)` pair: resolve/create the folder chain from the path's directory segments (matching existing folders by exact name under the same parent, case-sensitive), parse frontmatter, insert the note, then upsert any frontmatter tags. After every note in the batch is created, a second pass runs `syncNoteLinksCore` on each one — this is what makes cross-references within one import batch resolve regardless of file order. Returns a count for the UI to show ("Imported 12 notes").

**3. UI placement** — "Export all" near the Notes page header; a small Export action alongside each folder's and note's existing Move/Delete controls in `NotesTree.tsx`; an "Import" button (opens the file picker) near "Export all".

## Error Handling & Edge Cases

- Empty zip / zip with no `.md` entries: import completes reporting 0 notes, not an error.
- A zip entry path with folder names matching an *existing* folder tree: reused, not duplicated (per the approved duplicate-handling decision).
- A note title becomes a filename: sanitized (strip characters invalid in file/zip paths), collision-suffixed as described above.
- Export scope pointing at a folder/note the requesting user doesn't own: 404, same as any other owner-scoped lookup in this app.
- Import request exceeding the raised body-size limit: surfaces Next.js's own request-too-large error; not specially handled beyond raising the limit to a generous personal-scale value.

## Testing Approach

- **Unit tests**: `noteFrontmatter.ts` (serialize/parse round-trip, missing frontmatter, malformed frontmatter, titles/tags needing escaping, no tags/no dates); the filename sanitizer + collision-suffix helper.
- **Integration tests** (real Supabase): `resolveFolderPath` (creates new folders, reuses existing ones by name+parent, multi-level paths); the export route's core builder function for all three scopes, including cross-user isolation; `importNotes` end to end (folders created correctly from a zip's structure, tags restored, timestamps restored, wikilinks between two notes in the same batch resolve after the second pass, loose `.md` files land at root).
- **Manual verification**: export a real folder, inspect the zip's structure and a file's frontmatter by hand; re-import it and confirm the tree, tags, and dates match; import a hand-written loose `.md` with no frontmatter and confirm it lands sensibly.
