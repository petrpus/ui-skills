import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDemo, serializeStarter } from "@ui-skills/demo-generator";
import { resolveTokens, validateReview, validateTokens } from "@ui-skills/schema";
import { instrument } from "@ui-skills/snapshot";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type CanvasServer, serveSession } from "../src/server.ts";

/**
 * The one test that proves the loop holds end to end: serve → select → edit
 * text in place → pin a comment → Hotovo → a review.json an agent can act on.
 *
 * Exactly one, on the happy path — it is both the only test of the whole
 * loop and the most expensive one to maintain, so it does not grow into a
 * matrix (see #36). The page is our own demo.html rendered from the starter
 * tokens in this repo: when this fails, the bug is ours, not some third
 * party's redesign. The capture step has its own browser suite (`pnpm
 * test:capture`); here the snapshot is instrumented directly so the run
 * costs one browser, not two.
 */

const EDITED_TEXT = "E2E přepsáno smyčkou";
const COMMENT_TEXT = "E2E: připnutý komentář.";

let sessionDir: string;
let server: CanvasServer;
let browser: Browser;

beforeAll(async () => {
  const demo = renderDemo(resolveTokens(validateTokens(JSON.parse(serializeStarter()))));
  const instrumented = instrument(demo);

  sessionDir = mkdtempSync(join(tmpdir(), "loop-e2e-"));
  writeFileSync(join(sessionDir, "snapshot.html"), instrumented.html);
  writeFileSync(join(sessionDir, "map.json"), `${JSON.stringify(instrumented.map)}\n`);

  server = await serveSession(sessionDir);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  rmSync(sessionDir, { recursive: true, force: true });
});

it("smyčka drží: server → výběr → editace → komentář → Hotovo → review.json", async () => {
  const page = await browser.newPage();
  await page.goto(server.url);

  // Select: the overlay highlights and the breadcrumb appears.
  const heading = page.locator("h1[data-cx-id]").first();
  const originalText = (await heading.textContent()) ?? "";
  expect(originalText).not.toBe("");
  await heading.click();
  const breadcrumbVisible = await page.evaluate(() => {
    const host = document.getElementById("cx-overlay-host");
    const bar = host?.shadowRoot?.querySelector("[data-role='breadcrumb']");
    return bar !== null && bar !== undefined && !bar.hasAttribute("hidden");
  });
  expect(breadcrumbVisible).toBe(true);

  // Edit in place: dblclick, replace the text, Enter commits and POSTs.
  await heading.dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(EDITED_TEXT);
  await page.keyboard.press("Enter");

  // Pin a comment to a different element: C + click opens the bubble.
  const paragraph = page.locator("p[data-cx-id]").first();
  await page.keyboard.down("c");
  await paragraph.click();
  await page.keyboard.up("c");
  await page.locator("[data-role='comment-text']").fill(COMMENT_TEXT);
  await page.locator("[data-role='comment-category']").selectOption("idea");
  // The save button's POST is fire-and-forget in the overlay (#48), so the
  // test waits for the server's 204 before closing — otherwise /done races
  // the comment to the log and loses it only on a slow runner.
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith("/events") && response.status() === 204,
    ),
    page.locator("[data-role='comment-save']").click(),
  ]);

  // Hotovo compiles the log and shuts the server down.
  await page.locator("button[data-role='done']").click();
  const result = await server.done;

  const review = validateReview(JSON.parse(readFileSync(result.reviewPath, "utf8")));

  const change = review.changes.find((candidate) => candidate.after === EDITED_TEXT);
  expect(change).toBeDefined();
  expect(change?.before).toBe(originalText);
  expect(change?.target.selector).toContain("h1");

  const comment = review.comments.find((candidate) => candidate.text === COMMENT_TEXT);
  expect(comment).toBeDefined();
  expect(comment?.category).toBe("idea");
  expect(comment?.target.cxId).toMatch(/^cx-\d+$/);

  await page.close();
});
