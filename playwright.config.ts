import { defineConfig, devices } from "@playwright/test";

// Needed by the spec files for direct DB assertions (e.g. confirming a
// reminder row exists) via the same publishable-key client the app uses.
process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Tall enough that the calendar's 6-row month grid never needs a
        // page scroll -- dnd-kit auto-scrolls a scrolled container mid-drag,
        // which shifts the layout under a fixed target coordinate and sends
        // the drop to the wrong day cell.
        viewport: { width: 1280, height: 1100 },
      },
    },
  ],
  // Requires the local Supabase stack to already be running
  // (`supabase start`) -- Playwright only boots the Next.js dev server.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
