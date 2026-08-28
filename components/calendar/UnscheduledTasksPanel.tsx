import { UnscheduledTaskChip } from "@/components/calendar/UnscheduledTaskChip";
import type { Database } from "@/lib/supabase/database.types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

// Unlike the Tasks page's Completed/Archived sections, this is never
// collapsed by default -- it's the drag source for drag-to-timebox, so
// hiding it by default would hide the whole feature. Renders nothing when
// empty, same posture as TagFilterRow.
export function UnscheduledTasksPanel({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3 shadow-sm">
      <span className="text-xs font-medium text-muted-foreground">Unscheduled &mdash; drag onto a day</span>
      <div className="flex flex-wrap gap-1.5">
        {tasks.map((task) => (
          <UnscheduledTaskChip key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
