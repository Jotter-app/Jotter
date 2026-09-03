import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentUserId } from "@/lib/supabase/session";
import { exchangeCodeForTokens } from "@/lib/calendar-sync/googleClient";
import { encryptToken } from "@/lib/calendar-sync/tokenCrypto";
import { STATE_COOKIE } from "@/app/api/calendar/google/connect/route";

function settingsRedirect(origin: string, error?: string) {
  const url = new URL("/settings", origin);
  if (error) url.searchParams.set("calendar_error", error);
  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

export async function GET(request: Request) {
  const { supabase, userId } = await currentUserId();
  const origin = new URL(request.url).origin;
  if (!userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return settingsRedirect(origin, "state_mismatch");
  }
  if (!code) {
    // User denied consent, or Google returned an error instead of a code.
    return settingsRedirect(origin, "denied");
  }

  try {
    const redirectUri = `${origin}/api/calendar/google/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens.refreshToken) {
      // Shouldn't happen given access_type=offline + prompt=consent, but
      // a connection with no refresh token can't survive the access
      // token's ~1hr expiry -- not worth persisting.
      return settingsRedirect(origin, "no_refresh_token");
    }

    const key = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY!;
    const [accessTokenEncrypted, refreshTokenEncrypted] = await Promise.all([
      encryptToken(tokens.accessToken, key),
      encryptToken(tokens.refreshToken, key),
    ]);

    const { error } = await supabase.from("calendar_connections").upsert(
      {
        user_id: userId,
        provider: "google",
        google_calendar_id: "primary",
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: tokens.expiresAt,
        status: "active",
        last_error: null,
        // A reconnect after a revoke/expiry starts fresh -- the old
        // sync_token almost certainly no longer matches the new grant.
        sync_token: null,
      },
      { onConflict: "user_id,provider" }
    );
    if (error) {
      return settingsRedirect(origin, "save_failed");
    }
  } catch {
    return settingsRedirect(origin, "connect_failed");
  }

  return settingsRedirect(origin);
}
