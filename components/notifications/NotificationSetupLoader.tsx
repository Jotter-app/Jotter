"use client";

import dynamic from "next/dynamic";

// This depends on browser-only APIs (Notification, ServiceWorker,
// PushManager) that don't exist during SSR, so its rendered output can
// legitimately differ between server and client -- ssr: false skips
// server-rendering it entirely instead of accepting a hydration mismatch.
// ssr: false isn't allowed directly in a Server Component (see
// app/(app)/layout.tsx), hence this dedicated Client Component wrapper.
export const NotificationSetup = dynamic(
  () => import("@/components/notifications/NotificationSetup").then((m) => m.NotificationSetup),
  { ssr: false }
);
