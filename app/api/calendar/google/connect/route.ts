import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/supabase/session";
import { buildAuthUrl } from "@/lib/calendar-sync/googleClient";

export const STATE_COOKIE = "google_calendar_oauth_state";

// Kicks off a calendar-scoped Google OAuth grant, separate from the
// existing "Continue with Google" sign-in flow (that one's tokens are
// managed by Supabase Auth and never exposed to application code for
// ongoing background API calls -- this route needs its own client and its
// own persisted refresh token).
export async function GET(request: Request) {
  const { userId } = await currentUserId();
  if (!userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/calendar/google/callback`;
  const state = crypto.randomUUID();

  let authUrl: string;
  try {
    // buildAuthUrl throws if GOOGLE_CALENDAR_CLIENT_ID isn't set -- a real
    // first-run state (the Google Cloud OAuth client is a manual setup step
    // outside this codebase, per the design spec's Prerequisites), not an
    // edge case to let crash into Next's default error page.
    authUrl = buildAuthUrl(redirectUri, state);
  } catch {
    const url = new URL("/settings", origin);
    url.searchParams.set("calendar_error", "not_configured");
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(authUrl);
  // Short-lived, httpOnly -- only round-trips through Google's redirect to
  // prove the callback belongs to the request that started it (CSRF guard).
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });

  return response;
}
