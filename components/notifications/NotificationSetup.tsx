"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { urlBase64ToUint8Array } from "@/lib/push/urlBase64ToUint8Array";

type Status = "unsupported" | "default" | "granted" | "denied" | "pending";

function detectStatus(): Status {
  if (typeof window === "undefined") return "default";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  return Notification.permission as Status;
}

export function NotificationSetup() {
  // Computed via a lazy initializer (runs once, on mount) rather than an
  // effect + setState: this is a one-time read of external browser state,
  // not a subscription, so there's nothing to synchronize on re-renders.
  const [status, setStatus] = useState<Status>(detectStatus);

  useEffect(() => {
    if (status === "unsupported") return;
    // Register the service worker eagerly so it's ready by the time the
    // user opts in -- registration itself doesn't prompt for permission.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [status]);

  async function enable() {
    setStatus("pending");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission as Status);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setStatus("granted");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      setStatus("granted");
    } catch {
      setStatus("default");
    }
  }

  // Nothing to do if unsupported, already granted, or the user already said no.
  if (status === "unsupported" || status === "granted" || status === "denied") {
    return null;
  }

  return (
    <Button variant="outline" size="sm" onClick={enable} disabled={status === "pending"}>
      {status === "pending" ? "Enabling..." : "Enable reminders"}
    </Button>
  );
}
