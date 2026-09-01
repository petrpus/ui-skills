import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The browser-driven capture tests take a real browser and a real
    // serialisation run, so they are not part of the fast loop. `pnpm
    // test:capture` runs them; CI still does not (#38) — chromium is now
    // installed there for the e2e verify step, but wiring the capture suite
    // into CI is that issue's scope, not a byproduct of this exclude. The
    // e2e loop smoke has its own verify step (vitest.e2e.config.ts).
    exclude: ["**/node_modules/**", "**/*.browser.test.ts", "**/*.e2e.test.ts"],
  },
});
