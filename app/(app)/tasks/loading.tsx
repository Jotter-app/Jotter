import { Skeleton } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <Skeleton className="h-8 w-24" />
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <Skeleton className="h-9 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <Skeleton className="mb-3 h-4 w-20" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    </main>
  );
}
