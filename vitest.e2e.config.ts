import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Exactly one happy-path test drives a real browser through the whole
    // review loop (see #36). It runs as its own verify step so the fast
    // `pnpm test` loop stays fast, but unlike the capture suite it is part
    // of `pnpm verify` — the loop holding end to end is the project's core
    // claim, not an optional extra.
    include: ["**/*.e2e.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
