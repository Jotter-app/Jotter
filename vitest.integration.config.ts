import { defineConfig } from "vitest/config";
import path from "node:path";

// Requires a running local Supabase stack (`supabase start`). Kept separate
// from vitest.config.ts so `npm run test` stays fast/CI-friendly without
// Docker, and `npm run test:integration` is opt-in.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
