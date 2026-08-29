"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { urlBase64ToUint8Array } from "@/lib/push/urlBase64ToUint8Array";

type Status = "checking" | "unsupported" | "needs-subscription" | "subscribed" | "denied" | "pending";

export function NotificationSetup() {
  // Starts at "checking" rather than reading Notification.permission
  // synchronously: permission alone can't tell us whether a push
  // subscription actually exists server-side. A prior "granted" click that
  // happened before NEXT_PUBLIC_VAPID_PUBLIC_KEY was configured (or whose
  // subscribe() call otherwise failed) still leaves permission "granted"
  // forever after, which would permanently hide this button under the old
  // permission-only check even though push_subscriptions never got a row --
  // there'd be no way back in from the UI short of the user manually
  // resetting the site's browser permission. Checking the real subscription
  // via getSubscription() instead means a failed/missing subscribe always
  // leaves the button available to retry.
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    // Registering here (not just on click) means the service worker is
    // already active by the time the user opts in, and lets a returning
    // visitor who's already subscribed skip straight to "subscribed"
    // without ever seeing the button.
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setStatus(subscription ? "subscribed" : "needs-subscription"))
      .catch(() => setStatus("needs-subscription"));
  }, []);

  async function enable() {
    setStatus("pending");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "needs-subscription");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setStatus("needs-subscription");
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

      setStatus("subscribed");
    } catch {
      setStatus("needs-subscription");
    }
  }

  // Nothing to do while still checking, if unsupported, already subscribed,
  // or the user already said no at the OS level (permission denied can't be
  // re-prompted from a page -- only from the browser's own site settings).
  if (status === "checking" || status === "unsupported" || status === "subscribed" || status === "denied") {
    return null;
  }

  return (
    <Button variant="outline" size="sm" onClick={enable} disabled={status === "pending"}>
      {status === "pending" ? "Enabling..." : "Enable reminders"}
    </Button>
  );
}
