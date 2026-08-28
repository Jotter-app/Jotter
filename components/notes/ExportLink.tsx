import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ExportScope = { type: "all" } | { type: "folder"; id: string } | { type: "note"; id: string };

// Shared with the NotesTree row context menus, which link to this same
// endpoint via a plain <a> of their own rather than this component.
export function buildExportHref(scope: ExportScope): string {
  const params = new URLSearchParams({ scope: scope.type });
  if (scope.type !== "all") params.set("id", scope.id);
  return `/api/notes/export?${params.toString()}`;
}

// A plain <a> (not a client component) -- the browser handles the file
// download natively from a GET request, no JS needed to trigger it.
export function ExportLink({ scope, className }: { scope: ExportScope; className?: string }) {
  return (
    <a href={buildExportHref(scope)} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), className)}>
      Export
    </a>
  );
}
