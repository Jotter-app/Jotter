// Matches AddEventDialog's own default when no end time is given. Lives
// here (not in dispatch.ts, a "use server" file that can only export async
// functions) so dispatch.ts can import it without a "use server" export
// violation.
export const DEFAULT_EVENT_DURATION_MS = 3_600_000;

// A trailing duration phrase ("for 1 hour", "for 30 minutes") that chrono
// doesn't merge into a range on its own. Callers only apply this once a
// start date/time has already been found, and only against the remaining
// title text (not the raw input) -- keeps false-positive risk low: a bare
// "for 5 minutes" with no date signal never reaches this, and it can't
// hijack a date match the way it would if scanned independently. Shared by
// parseImplicit and parseExplicit so the two never drift.
const DURATION_PATTERN = /\bfor\s+(\d+)\s*(hour|hr|minute|min)s?\b/i;

export function applyDurationRegex(title: string, dueAt: Date): { title: string; endAt: Date | null } {
  const match = title.match(DURATION_PATTERN);
  if (!match) return { title, endAt: null };

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms = unit.startsWith("h") ? amount * 3_600_000 : amount * 60_000;

  return {
    title: title.replace(DURATION_PATTERN, "").replace(/\s{2,}/g, " ").trim(),
    endAt: new Date(dueAt.getTime() + ms),
  };
}
