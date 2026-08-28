import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggleLoader";

export function AuthPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          J
        </div>
        <span className="font-heading text-xl text-accent-700">Jotter</span>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl bg-card p-6 shadow-sm">
        <h1 className="font-heading text-xl">{title}</h1>
        {children}
      </div>
    </main>
  );
}
