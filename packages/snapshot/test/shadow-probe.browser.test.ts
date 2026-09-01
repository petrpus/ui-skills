import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probeClosedShadowRoots } from "../src/shadow-probe.ts";

/**
 * The probe against a real browser: the counting logic is unit-tested, but
 * whether CDP's pierce actually reveals closed roots is a browser fact.
 * Lives in the capture suite (`pnpm test:capture`) for the same reason the
 * serialiser criteria do — slow rather than silently skipped.
 */

const FIXTURE = "packages/snapshot/fixtures/control.html";

let plainDir: string;

beforeAll(() => {
  plainDir = mkdtempSync(join(tmpdir(), "shadow-probe-"));
  writeFileSync(
    join(plainDir, "plain.html"),
    `<!doctype html><html><body>
      <div id="open-host"></div>
      <script>
        document.getElementById("open-host").attachShadow({ mode: "open" })
          .innerHTML = "<p>otevřený</p>";
      </script>
    </body></html>`,
  );
});

afterAll(() => {
  rmSync(plainDir, { recursive: true, force: true });
});

describe("probeClosedShadowRoots", () => {
  it("na kontrolní fixtuře najde zavřený root, o který snapshot přichází", async () => {
    // Exact on purpose: this is the one place a real-Chromium double-count
    // (a root surfacing through children as well as shadowRoots) would show.
    const count = await probeClosedShadowRoots(pathToFileURL(FIXTURE).href);
    expect(count).toBe(1);
  }, 60_000);

  it("stránka jen s otevřeným rootem hlásí nulu", async () => {
    const count = await probeClosedShadowRoots(pathToFileURL(join(plainDir, "plain.html")).href);
    expect(count).toBe(0);
  }, 60_000);
});
