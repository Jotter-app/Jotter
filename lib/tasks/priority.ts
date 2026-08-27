// Kept within the Organic palette (sage -> light terracotta -> deep
// terracotta) rather than the old blue/amber/red, so priority dots don't
// clash with the warm accent system.
export const PRIORITY_LEVELS = [
  { value: 0, label: "None", color: "bg-muted-foreground" },
  { value: 1, label: "Low", color: "bg-accent-2-500" },
  { value: 2, label: "Medium", color: "bg-accent-400" },
  { value: 3, label: "High", color: "bg-accent-700" },
] as const;

export function priorityLabel(value: number) {
  return PRIORITY_LEVELS.find((p) => p.value === value)?.label ?? "None";
}

export function priorityColor(value: number) {
  return PRIORITY_LEVELS.find((p) => p.value === value)?.color ?? "bg-muted-foreground";
}
