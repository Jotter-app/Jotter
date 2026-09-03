import { describe, expect, it } from "vitest";

// Requires the local Supabase stack (`supabase start`), including the
// edge-runtime container serving sync-calendars from this repo's
// supabase/functions/ directory. Invokes the real deployed-locally function
// over HTTP rather than importing Deno code into Vitest -- same convention
// as tests/integration/send-reminders.test.ts. No test here asserts on a
// zero/empty global connection count -- the shared local dev stack this
// suite runs against can have a real connection on it from manual testing
// (as it did the first time this exact assumption broke), so assertions
// are scoped to a specific (here, nonexistent) connectionId instead,
// matching how every other integration test in this suite scopes by the
// ids it created/passed rather than by the state of the whole table.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const FUNCTION_URL = `${url}/functions/v1/sync-calendars`;

describe("sync-calendars edge function", () => {
  it("responds with a well-formed summary for an unscoped invocation", async () => {
    const res = await fetch(FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json" } });
    expect(res.ok).toBe(true);

    const body = (await res.json()) as { processed: number; results: unknown[] };
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.processed).toBe(body.results.length);
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
