import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { NotificationSetup } from "@/components/notifications/NotificationSetupLoader";
import { ThemeToggle } from "@/components/theme/ThemeToggleLoader";
import { TopNav } from "@/components/layout/TopNav";

// Belt-and-suspenders with proxy.ts: proxy already redirects unauthenticated
// requests to /login, but a Server Component that renders without going
// through proxy's matcher (e.g. a future edge case) should still not render
// protected content.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  if (!claims) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b bg-background/95 px-4 py-2.5 backdrop-blur supports-backdrop-filter:bg-background/75">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              J
            </div>
            <span className="hidden font-heading text-lg text-accent-700 sm:inline">Jotter</span>
          </div>
          <TopNav />
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationSetup />
          <GlobalSearch />
          <ThemeToggle />
          <Link href="/settings">
            <Button variant="ghost" size="sm" aria-label="Settings">
              <Settings className="size-4" />
            </Button>
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
              <LogOut className="size-4" />
              <span className="hidden md:inline">Sign out</span>
            </Button>
          </form>
        </div>
      </header>
      <div className="flex flex-1">{children}</div>
    </div>
  );
}
