import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.browser.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
