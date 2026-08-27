# Jotter UI Redesign ("Organic") — Design Spec

**Date:** 2026-08-27
**Status:** Approved for planning

## Summary

Jotter currently uses a largely grayscale shadcn/ui theme with one blue accent, standard shadcn radii, and a single sans-serif font. This redesign reskins the whole app in "Organic" — a warm design system (cream ground, terracotta primary accent, sage second accent, Caprasimo display headings over Figtree body text, heavy rounding that grows into pill shapes, Lucide icons at a heavier stroke) originally worked out as a set of Claude Design mockups covering the Notes area and mobile auth/onboarding. This spec extends that system to the two-thirds of the app the mockups didn't cover — Tasks, Calendar, Settings, and a new mobile navigation pattern — and defines how it gets built: by re-theming the existing shadcn/ui component layer in place, not replacing it.

The mockups (and the two draft extensions produced during this design session — Tasks/Calendar/Settings, and the mobile bottom-nav) are the visual source of truth for tone and detail; this document is the source of truth for scope, mapping, and sequencing.

## Goals

- Apply the Organic system's tokens (color ramps, fonts, radius scale, shadows, icon stroke width) app-wide, in both light and dark mode, via the existing shadcn CSS-variable theme layer.
- Reskin every existing page — Notes (dashboard, editor, notebook/tag management), Tasks, Calendar (month + week), Settings, Auth (login/signup), onboarding — to match.
- Add a bottom tab bar for primary navigation (Tasks/Notes/Calendar) on narrow viewports, replacing today's icon-only top-nav fallback, with secondary actions (search, settings, theme, sign out) moved into an overflow sheet at that width.
- Ship in independently reviewable phases: a foundation phase, then one phase per page area.
- Preserve every existing behavior, route, and data flow untouched — this is visual only.

## Non-Goals

- No new features, no schema/migration changes, no changes to any server action or route.
- No change to test IDs, ARIA roles, or DOM structure beyond what's needed to apply new classes — the existing Playwright/Vitest suites don't assert on Tailwind classes or colors (confirmed by search), so no test rewrites are expected, but each phase still gets a manual + existing-suite pass.
- Not replacing shadcn/ui with a custom component library. The mockups' literal `.btn`/`.card`/`.tag` CSS classes are a reference for *how things should look*, not literal code to port in.
- Not designing a separate native mobile app shell — the bottom tab bar is added chrome within the same responsive Next.js app, not a new architecture.
- No photography/illustration work (`.washed` image treatment from the design system) — Jotter has no user-facing photos today.
- Desktop layout is unchanged for Tasks/Calendar/Settings/global chrome beyond restyling — no new desktop-only navigation elements.

## Design Tokens & Foundation

All values below come from the mockups' `styles.css` (light) with dark-mode values taken from the mockups' dark variants of the Notes screens (the only screens mocked in dark) and extended consistently to the rest.

| Token | Old (shadcn default) | New (Organic) |
|---|---|---|
| `--background` / `--foreground` | white / near-black grayscale | `#f5ead8` / `#201e1d` (light), `#211c17` / `#f3e9d8` (dark) |
| `--primary` | clean blue `oklch(0.546 0.215 262.881)` | terracotta `#c67139` (light), `#d98a52` (dark) |
| `--card` / `--secondary` / `--muted` | near-white grayscale | Organic's neutral-100/200 tan surfaces (`#f9f4ed`/`#eee7db` light, `#2c241d`/`#3d332a` dark) |
| `--accent` (shadcn's *hover-tint* role — distinct from Organic's "accent" meaning) | light gray | a neutral-200-ish tan tint, so shadcn's hover/expanded states stay legible against the new ground |
| `--border` / `--input` | light gray | Organic's `--color-divider` (`color-mix(in srgb, #201e1d 16%, transparent)`), dark equivalent |
| `--ring` (focus ring) | blue | terracotta, per the system's `:focus-visible { outline: 2px solid accent }` rule |
| `--destructive` | shadcn red | kept as-is — Organic has no destructive/red token, and delete/danger actions should stay visually distinct from the warm palette rather than blend into the terracotta accent |
| `--radius` | `0.625rem` (10px) | `16px` — covers the existing `sm/md/lg/xl/2xl/3xl/4xl` multiplier scale for cards, dialogs, popovers |
| Pills (buttons, inputs, tags) | `rounded-lg` (scale-derived) | explicit `rounded-full` override — a single `--radius` multiplier can't express both "16–28px card round" and "true pill," so these few components get a targeted class change, not just a token swap (see Architecture) |
| Card corner (the 22–28px "over-round" look in the mockups) | — | a slightly larger explicit radius than the `--radius` base gives via its scale, applied where the mockups show it (Notes/Tasks/Settings cards, day cells) |
| `--font-sans` / heading font | one sans font for both | Figtree for body (`--font-body`), Caprasimo for headings (`--font-heading`) — both loaded via `next/font/google`, replacing Geist |
| Icon stroke width | Lucide default (2) | 2.75, applied globally (`svg { stroke-width: 2.75 }` in `globals.css` — a plain CSS property beats Lucide's inline `stroke-width` attribute) |
| New: tonal ramps | — | `--color-accent-100..900`, `--color-accent-2-100..900`, `--color-neutral-100..900`, added as new custom properties (not replacing any existing shadcn variable) and exposed as Tailwind utilities via `@theme inline`, for tag colors, hover tints, and section-accent dots that the flat shadcn set can't express |
| Shadows | shadcn defaults | Organic's ink-tinted `--shadow-sm/md/lg`, already tuned per-theme in the mockups |

Dark mode is not a separate design pass — it's the same ground/surface swap the mockups already validated for Notes, applied identically everywhere else (this is a token change, not a per-page decision).

## Component Strategy

Every component in `components/ui/` (`Button`, `Input`, `Checkbox`, `Dialog`, `Select`, `Popover`, `Command`, `DropdownMenu`, `ContextMenu`, `AlertDialog`, `Label`, `Skeleton`, `InputGroup`, `Textarea`) keeps its current implementation, variants, and behavior. Changes are:

1. **Token-only** for most of them — swapping `--primary`/`--card`/`--border`/`--radius` etc. cascades through automatically since every component already reads from those CSS variables via Tailwind's `@theme inline` mapping in `globals.css`.
2. **Targeted class overrides** for the handful of components the mockups show as pills rather than the scale's rounded-lg default: `Button` (all sizes), `Input`/`Textarea`, and the ad-hoc tag/pill markup used inline across pages (there is no shared `Tag` or `Card` component today — each page builds cards and tags with inline Tailwind classes, e.g. `rounded-xl border bg-card p-4 shadow-sm` in `tasks/page.tsx` and `settings/page.tsx`). These call sites get their radius classes bumped (`rounded-xl` → the new card round; button/input/tag markup → `rounded-full`) as part of each page's own phase, not centrally.
3. No shadcn primitive is added, removed, or forked.

## Page-by-Page Treatment

| Area | Treatment |
|---|---|
| **Global chrome** (`AppLayout`, `TopNav`) | Header reskinned in place — cream ground, terracotta active pill (already the existing active-state pattern in `TopNav`, just recolored), Caprasimo brand mark. Unchanged structurally on desktop/tablet widths. |
| **Mobile nav** (new) | Below the existing responsive breakpoint where `TopNav` labels already hide, add a fixed bottom tab bar (Tasks/Notes/Calendar, icon + label, terracotta-tinted pill on the active tab) in place of the icon-only top nav. Search, theme toggle, settings, and sign-out move into a `☰` overflow menu reachable from the mobile top bar, built from the existing shadcn `DropdownMenu` primitive — not a new UI primitive, not a full page. |
| **Notes** (dashboard, editor, notebook/tag management) | Matches the original mockups directly: left sidebar (`NotesTree` — notebooks + tags) stays a sidebar, reskinned; the note editor's markdown chrome and `/task` callout box match the mocked editor; the pillar switcher (Tasks/Notes/Calendar pills shown in the mockup's sidebar) is **not** duplicated there — it stays in the existing top header, since that's already the app's actual switcher and the sidebar is Notes-internal navigation. |
| **Tasks** | Per the drafted mockup: due-date-grouped sections become rounded cards (matching the accent/urgency dot Tasks already uses, recolored — overdue gets a solid terracotta pill rather than just a dot, for real visual urgency), circular checkboxes (unchecked outline → filled terracotta with a check mark), pill tag filter row, quick-add as a full pill input. |
| **Calendar** (month + week) | Per the drafted mockup: the hairline `bg-border` grid is replaced with separated rounded day cells; calendar events are sage pills, tasks-due are small terracotta-dot rows (preserves the existing event-vs-task visual distinction, just re-skinned); "today" gets a filled terracotta circle on the date number plus a tinted cell background. |
| **Settings** | Per the drafted mockup: each toggle becomes a rounded card with a pill switch (terracotta track when on) instead of a bare shadcn checkbox; copy is unchanged. |
| **Auth** (login/signup, `AuthPageShell`) | Matches the mobile mockups: same centered-card shell and structure, reskinned tokens/fonts. |
| **Onboarding / empty states** | Matches the mobile mockup directly (icon circle, headline, `/task`-syntax example callout, primary/ghost button pair). |

## Architecture / Implementation Notes

| | Mechanism | Why |
|---|---|---|
| Token source | `app/globals.css` — replace `:root`/`.dark` variable values, extend `@theme inline` with the new tonal-ramp custom properties and `--font-heading`/`--font-body` | Single file already holds every shadcn variable; no new build tooling needed |
| Fonts | `app/layout.tsx` — swap `Geist`/`Geist_Mono` for `Caprasimo`/`Figtree` via `next/font/google`, same `variable` pattern | Matches the existing font-loading approach exactly |
| Icon weight | One `svg { stroke-width: 2.75 }` rule in `globals.css` | Applies to every `lucide-react` icon app-wide without touching call sites |
| Pill overrides | `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/textarea.tsx` — change base radius class to `rounded-full` | The only code-level (not pure-CSS-variable) changes the foundation phase needs |
| Per-page card/tag markup | Inline Tailwind classes at each call site (`tasks/page.tsx`, `settings/page.tsx`, `calendar/*`, `notes/*`) | No shared `Card`/`Tag` component exists today; introducing one is optional cleanup, not required for this redesign, and left out to avoid scope creep — each page's own phase updates its own inline classes |
| Mobile bottom nav | New `components/layout/BottomNav.tsx` (mirrors `TopNav`'s active-route logic), rendered from `AppLayout` and hidden above the mobile breakpoint (swap of Tailwind's existing responsive hide/show, not a new breakpoint system) | Reuses `TopNav`'s exact active-path logic rather than duplicating it |
| Mobile overflow menu | New `DropdownMenu` (existing shadcn primitive) wrapping the existing `Settings`/theme-toggle/sign-out actions already in `AppLayout`'s header, triggered by the `☰` icon at the mobile breakpoint | These actions already exist as isolated components (`ThemeToggle`, sign-out form, settings link) — this only changes where they're mounted at narrow widths, and reuses a primitive already in `components/ui/dropdown-menu.tsx` rather than introducing a new one |

## Rollout Phases

Each phase is its own commit/PR, independently reviewable and shippable, per the project's existing practice:

0. **Foundation** — tokens, fonts, icon stroke width, pill overrides on `Button`/`Input`/`Textarea`. App-wide visual shift lands here even before individual pages get their bespoke treatment, since every page inherits it immediately.
1. **Notes** — dashboard, editor, notebook/tag management (closest to the original mockups).
2. **Tasks**
3. **Calendar** (month + week views)
4. **Settings**
5. **Auth + onboarding** (login/signup, empty states)
6. **Mobile navigation** — bottom tab bar + overflow sheet (last, since it's genuinely new UI rather than a reskin, and benefits from every other page already being on the new token set)

## Testing Approach

- **Automated**: existing Vitest unit/integration and Playwright e2e suites should pass unmodified per phase — none assert on Tailwind classes or specific colors (confirmed by search), only on text/role/behavior. Run the full suite after each phase as a regression check, not because this spec expects failures.
- **Manual, per phase**: visual pass in both light and dark mode, and at both a desktop and a mobile viewport width, using the actual browser (not just a static mockup) — check contrast (the system's own guidance notes the accent-to-ground pair is only tuned to ~3:1, sufficient for chrome/icons but not body text, so body-copy-on-accent needs a deep ramp step like `--color-accent-700`, not the base accent), hover/pressed/focus-visible states, and that no layout regresses at the breakpoint where the bottom nav takes over from the top nav.
- **No new visual-regression tooling** is introduced — manual verification per phase matches how this project has shipped every prior feature.
