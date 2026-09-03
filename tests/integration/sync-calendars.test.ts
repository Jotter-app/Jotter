import { describe, expect, it } from "vitest";

// Requires the local Supabase stack (`supabase start`), including the
// edge-runtime container serving sync-calendars from this repo's
// supabase/functions/ directory. Invokes the real deployed-locally function
// over HTTP rather than importing Deno code into Vitest -- same convention
// as tests/integration/send-reminders.test.ts. There's no real Google OAuth
// connection configured for any test user, so this only exercises the
// "nothing active to sync" no-op path; the connect/pull/push flow against a
// real Google account is manual-verification-only (see the design spec's
// Testing Approach), same as send-reminders' actual push/email delivery.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const FUNCTION_URL = `${url}/functions/v1/sync-calendars`;

describe("sync-calendars edge function", () => {
  it("returns success with zero connections processed when nothing is connected", async () => {
    const res = await fetch(FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json" } });
    expect(res.ok).toBe(true);

    const body = (await res.json()) as { processed: number; results: unknown[] };
    expect(body.processed).toBe(0);
    expect(body.results).toEqual([]);
  });

  it("scopes to a single connection via ?connectionId= without erroring on an unknown id", async () => {
    const res = await fetch(`${FUNCTION_URL}?connectionId=00000000-0000-0000-0000-000000000000`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.ok).toBe(true);

    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(0);
  });
});
