import { format } from "date-fns";

// Shared by processNoteCommands.ts (the "/task create" flow) and the
// line-to-task toolbar command -- both need the exact same checkbox+marker
// shape so liveMarkdownPlugin's TaskMarker handling renders either one
// identically.
export function formatTaskCheckboxLine(taskId: string, title: string, dueAt: Date | null, tags: string[]): string {
  const dueText = dueAt ? ` (due ${format(dueAt, "MMM d, h:mm a")})` : "";
  const tagsText = tags.map((tag) => ` #${tag}`).join("");
  return `- [ ] ${title}${dueText}${tagsText} <!-- task:${taskId} -->`;
}
