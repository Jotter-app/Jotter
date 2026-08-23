export const PRIORITY_LEVELS = [
  { value: 0, label: "None", color: "bg-muted-foreground" },
  { value: 1, label: "Low", color: "bg-blue-500" },
  { value: 2, label: "Medium", color: "bg-amber-500" },
  { value: 3, label: "High", color: "bg-red-500" },
] as const;

export function priorityLabel(value: number) {
  return PRIORITY_LEVELS.find((p) => p.value === value)?.label ?? "None";
}

export function priorityColor(value: number) {
  return PRIORITY_LEVELS.find((p) => p.value === value)?.color ?? "bg-muted-foreground";
}
