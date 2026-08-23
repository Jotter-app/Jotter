export type JotterRoute = "task" | "event" | "note";

export interface JotterIntent {
  route: JotterRoute;
  title: string;
  /** Note route only. */
  noteBody?: string;
  dueAt: Date | null;
  endAt: Date | null;
  tags: string[];
}
