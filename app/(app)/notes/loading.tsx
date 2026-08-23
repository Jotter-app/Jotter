import { Skeleton } from "@/components/ui/skeleton";

export default function NotesLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <Skeleton className="h-8 w-20" />
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="ml-4 h-6 w-32" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-6 w-36" />
        </div>
      </div>
    </main>
  );
}
