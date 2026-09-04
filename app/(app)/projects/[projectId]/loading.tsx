import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-9 w-16" />
      </div>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <Skeleton className="mb-3 h-4 w-20" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    </main>
  );
}
