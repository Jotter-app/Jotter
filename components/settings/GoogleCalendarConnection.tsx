"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { disconnectGoogleCalendar, triggerSyncNow } from "@/lib/actions/calendarConnections";
import { formatInTimeZone } from "@/lib/dates/formatInTimeZone";
import { useTimeZone } from "@/components/shared/TimeZoneProvider";
import type { Database } from "@/lib/supabase/database.types";

type CalendarConnection = Database["public"]["Tables"]["calendar_connections"]["Row"];

// Query-param codes the OAuth routes (app/api/calendar/google/connect and
// .../callback) redirect back to /settings with on failure -- centralized
// here since this component is the only place that ever displays them.
const CONNECT_ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Google Calendar isn't set up for this app yet -- a Google Cloud OAuth client needs to be configured first.",
  state_mismatch: "That connection attempt expired or didn't match -- please try connecting again.",
  denied: "Google sign-in was cancelled before it finished.",
  no_refresh_token: "Google didn't grant the access this needs -- please try connecting again.",
  save_failed: "Connected to Google, but couldn't save it here -- please try again.",
  connect_failed: "Couldn't connect to Google -- please try again.",
};

export function GoogleCalendarConnection({
  connection,
  connectError,
}: {
  connection: CalendarConnection | null;
  connectError?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const timeZone = useTimeZone();
  const connectErrorMessage = connectError ? (CONNECT_ERROR_MESSAGES[connectError] ?? "Couldn't connect to Google -- please try again.") : null;

  if (!connection) {
    return (
      <div className="flex items-start justify-between gap-4 rounded-2xl bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Google Calendar</p>
          <p className="text-xs text-muted-foreground">
            Connect your Google Calendar to sync events both ways -- new events can be sent to Google, and changes
            made there show up here.
          </p>
          {connectErrorMessage && <p className="text-xs text-destructive">{connectErrorMessage}</p>}
        </div>
        <Link href="/api/calendar/google/connect">
          <Button size="sm">Connect Google Calendar</Button>
        </Link>
      </div>
    );
  }

  const hasError = connection.status === "error";

  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Google Calendar</p>
        <p className={`text-xs ${hasError ? "text-destructive" : "text-muted-foreground"}`}>
          {hasError
            ? (connection.last_error ?? "Something went wrong -- reconnect to keep syncing.")
            : connection.last_synced_at
              ? `Last synced ${formatInTimeZone(connection.last_synced_at, timeZone, "MMM d, h:mm a")}`
              : "Connected -- not synced yet."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {hasError ? (
          <Link href="/api/calendar/google/connect">
            <Button size="sm" variant="outline">
              Reconnect
            </Button>
          </Link>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(async () => void (await triggerSyncNow()))}
          >
            {isPending ? "Syncing..." : "Sync now"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => startTransition(() => disconnectGoogleCalendar())}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}
