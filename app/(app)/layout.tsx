import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

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
        <span className="font-semibold">Mix-Match</span>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>
      <div className="flex flex-1">{children}</div>
    </div>
  );
}
