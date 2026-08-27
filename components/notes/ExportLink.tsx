import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ExportScope = { type: "all" } | { type: "folder"; id: string } | { type: "note"; id: string };

// A plain <a> (not a client component) -- the browser handles the file
// download natively from a GET request, no JS needed to trigger it.
// Styled to match the Button components its neighboring row actions use
// (the "Move to..." select, ConfirmDeleteButton's Delete trigger).
export function ExportLink({ scope, className }: { scope: ExportScope; className?: string }) {
  const params = new URLSearchParams({ scope: scope.type });
  if (scope.type !== "all") params.set("id", scope.id);

  return (
    <a
      href={`/api/notes/export?${params.toString()}`}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), className)}
    >
      Export
    </a>
  );
}
