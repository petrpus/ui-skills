import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The browser-driven capture tests take a real browser and a real
    // serialisation run, so they are not part of the fast loop. `pnpm
    // test:capture` runs them, and CI runs them as their own job (see
    // .github/workflows/verify.yml). The e2e loop smoke has its own verify
    // step (vitest.e2e.config.ts).
    exclude: ["**/node_modules/**", "**/*.browser.test.ts", "**/*.e2e.test.ts"],
  },
});
