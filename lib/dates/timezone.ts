// Isomorphic constants only -- safe to import from both Server Components
// and "use client" files. The actual cookie read (next/headers, server-only)
// lives in getUserTimeZone.ts instead, so importing that from a Client
// Component fails loudly at build time rather than silently bundling
// server-only code.
export const TZ_COOKIE_NAME = "tz";

// Falls back to this when no cookie is present yet (first-ever visit, or a
// browser that blocks cookie writes) -- matches Vercel's default serverless
// runtime timezone, i.e. exactly what the server would have used anyway
// before TimeZoneProvider existed.
export const DEFAULT_TIME_ZONE = "UTC";
