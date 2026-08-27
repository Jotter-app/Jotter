// A tag is "note-only" (hidden when the setting is on) if it has zero
// current attachments in the task-scoped taggables the Tasks page already
// fetches -- purely computed from that, not a persisted flag, so a tag
// reappears the moment it's actually attached to a task.
export function filterNoteOnlyTags<T extends { id: string }>(
  tags: T[],
  taskTaggables: { tag_id: string }[],
  hideNoteOnlyTags: boolean
): T[] {
  if (!hideNoteOnlyTags) return tags;

  const tagIdsWithTaskAttachment = new Set(taskTaggables.map((row) => row.tag_id));
  return tags.filter((tag) => tagIdsWithTaskAttachment.has(tag.id));
}
