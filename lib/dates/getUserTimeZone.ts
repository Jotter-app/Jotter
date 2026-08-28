import { cookies } from "next/headers";
import { TZ_COOKIE_NAME, DEFAULT_TIME_ZONE } from "@/lib/dates/timezone";

// Server-only (imports next/headers) -- call only from a Server Component
// or Route Handler, never from a "use client" file. The cookie is written
// by TimeZoneProvider once it detects the browser's real timezone; until
// that first write lands, callers get DEFAULT_TIME_ZONE.
export async function getUserTimeZone(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get(TZ_COOKIE_NAME)?.value || DEFAULT_TIME_ZONE;
}
