import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The browser-driven capture tests take a real browser and a real
    // serialisation run, so they are not part of the fast loop. `pnpm
    // test:capture` runs them; CI does not yet, because it has no browsers —
    // see the follow-up issue rather than assuming they are covered.
    exclude: ["**/node_modules/**", "**/*.browser.test.ts"],
  },
});
