"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FolderKanban, ListTodo, NotebookText } from "lucide-react";

// Same routes/active-path logic as TopNav (components/layout/TopNav.tsx) --
// this replaces it below the breakpoint where TopNav hides, so the two
// never show at once, but each holds its own copy of this list (no shared
// constant module) -- keep both in sync by hand when adding a route.
const NAV_ITEMS = [
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/notes", label: "Notes", icon: NotebookText },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-1 border-t bg-card/95 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur supports-backdrop-filter:bg-card/75 sm:hidden">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-medium ${
              active ? "bg-accent-100 text-accent-800" : "text-muted-foreground"
            }`}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
