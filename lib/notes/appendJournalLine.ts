export function appendJournalLine(body: string, line: string): string {
  const trimmed = body.trimEnd();
  return trimmed ? `${trimmed}\n\n${line}` : line;
}
