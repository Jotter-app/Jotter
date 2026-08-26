export interface NoteLinkDiff {
  toAdd: string[];
  toRemove: string[];
}

// Pure set diff, no Supabase involved -- independently unit-testable.
export function diffNoteLinks(existingTargetIds: string[], desiredTargetIds: string[]): NoteLinkDiff {
  const existing = new Set(existingTargetIds);
  const desired = new Set(desiredTargetIds);
  return {
    toAdd: [...desired].filter((id) => !existing.has(id)),
    toRemove: [...existing].filter((id) => !desired.has(id)),
  };
}
