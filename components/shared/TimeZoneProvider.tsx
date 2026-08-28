"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TZ_COOKIE_NAME } from "@/lib/dates/timezone";

const TimeZoneContext = createContext<string | null>(null);

// Every "is this due today/tomorrow/overdue" computation in the app reads
// the viewer's IANA timezone from here rather than trusting date-fns
// functions' default behavior (the executing runtime's own local
// timezone) -- during the server render that produces the initial HTML,
// that runtime is the server's (UTC on Vercel), not the viewer's, so
// classifying dates against it produces text that then disagrees with
// what the browser computes on hydration, which is a hard React hydration
// error, not just a cosmetic flash. Sourcing both passes from this same
// context value (populated server-side from a cookie -- see
// getUserTimeZone -- and handed down as a prop, not recomputed
// independently on each side) keeps them in permanent agreement instead.
export function useTimeZone(): string {
  const timeZone = useContext(TimeZoneContext);
  if (timeZone === null) {
    throw new Error("useTimeZone must be used within a TimeZoneProvider");
  }
  return timeZone;
}

export function TimeZoneProvider({ timeZone, children }: { timeZone: string; children: ReactNode }) {
  const router = useRouter();
  // Guards against retrying every render if the cookie write silently
  // fails (e.g. a browser blocking cookies) -- without it, a persistent
  // mismatch would call router.refresh() on every re-render, forever.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected || detected === timeZone) return;
    attempted.current = true;
    document.cookie = `${TZ_COOKIE_NAME}=${encodeURIComponent(detected)}; path=/; max-age=31536000; samesite=lax`;
    // Re-runs Server Components on the current route with the now-correct
    // cookie present, without a full page reload -- the one-time
    // correction a first-ever visit (or a stale cookie from travel) needs.
    router.refresh();
  }, [timeZone, router]);

  return <TimeZoneContext.Provider value={timeZone}>{children}</TimeZoneContext.Provider>;
}
