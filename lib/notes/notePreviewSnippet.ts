export function notePreviewSnippet(bodyMarkdown: string, maxLength = 150): string {
  const collapsed = bodyMarkdown.replace(/\s+/g, " ").trim();
  if (!collapsed) return "No content yet.";
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength).trimEnd()}…` : collapsed;
}
