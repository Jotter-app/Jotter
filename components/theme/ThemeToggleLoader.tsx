"use client";

import dynamic from "next/dynamic";

// Same reasoning as NotificationSetupLoader.tsx: the resolved theme isn't
// known until after mount (next-themes reads localStorage/matchMedia
// client-side), so this skips SSR entirely rather than risking a
// hydration mismatch on which icon renders first.
export const ThemeToggle = dynamic(
  () => import("@/components/theme/ThemeToggle").then((m) => m.ThemeToggle),
  { ssr: false }
);
