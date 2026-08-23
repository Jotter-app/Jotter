import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { NotificationSetup } from "@/components/notifications/NotificationSetupLoader";

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
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Mix-Match</span>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/tasks" className="hover:text-foreground">
              Tasks
            </Link>
            <Link href="/notes" className="hover:text-foreground">
              Notes
            </Link>
            <Link href="/calendar" className="hover:text-foreground">
              Calendar
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <NotificationSetup />
          <GlobalSearch />
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <div className="flex flex-1">{children}</div>
    </div>
  );
}
