import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Minimal Vitest setup: a plain alias instead of a plugin so the suite stays
 * host-runnable and independent of the Next.js build pipeline.
 *
 * `environment: "node"` because every suite exercises server-side modules
 * (authorization, rate limiting, OAuth helpers). DB-backed suites are skipped
 * unless `TEST_DATABASE_URL` is set, so the default run never touches a DB.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Keep the app's `.env` out of the test process: tests must control env
    // explicitly via vi.stubEnv so fail-closed behaviour is deterministic.
    env: {},
    unstubEnvs: true,
  },
});
