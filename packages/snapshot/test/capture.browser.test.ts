import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CaptureResult, capture } from "../src/capture.ts";
import { CX_ID_ATTRIBUTE, type LocationMap } from "../src/types.ts";

/**
 * The spike's four criteria, turned into a test that runs on every change.
 *
 * The spike answered them once, for a decision. This answers them continuously,
 * for a dependency: an upgrade of the serialiser that quietly stopped preserving
 * custom properties would otherwise be discovered somewhere in phase 2, by
 * someone wondering why a CSS panel changes nothing.
 *
 * Runs a real browser and a real capture, so it lives outside `pnpm verify` —
 * see `pnpm test:capture`. Kept honest by being slow rather than by being
 * skipped: a test that quietly opts out when a browser is missing is a test
 * nobody notices has stopped running.
 */

const FIXTURE = "packages/snapshot/fixtures/control.html";
const WORK_DIR = "tmp/capture-test";
const NAME_SHIM = "globalThis.__name = globalThis.__name || ((fn) => fn);";

let result: CaptureResult;
let map: LocationMap;

beforeAll(async () => {
  rmSync(WORK_DIR, { recursive: true, force: true });
  result = capture(FIXTURE, WORK_DIR, { browserExecutablePath: chromium.executablePath() });
  map = JSON.parse(readFileSync(result.mapPath, "utf8"));
}, 180_000);

afterAll(() => {
  rmSync(WORK_DIR, { recursive: true, force: true });
});

async function openSnapshot() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript({ content: NAME_SHIM });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("file:") && !request.url().startsWith("data:")) {
      requests.push(request.url());
    }
  });
  await page.goto(pathToFileURL(result.snapshotPath).href, { waitUntil: "load" });
  return { browser, page, requests };
}

describe("what the capture produces", () => {
  it("writes a snapshot and a map", () => {
    expect(existsSync(result.snapshotPath)).toBe(true);
    expect(existsSync(result.mapPath)).toBe(true);
    expect(result.elements).toBeGreaterThan(0);
  });

  it("identifies every element it recorded", () => {
    expect(Object.keys(map).length).toBe(result.elements);
  });
});

describe("the assumptions the whole project rests on", () => {
  it("(a) keeps custom properties, and repainting one repaints the page", async () => {
    const { browser, page } = await openSnapshot();

    const affected = await page.evaluate(() => {
      const before = Array.from(document.querySelectorAll("*")).map(
        (element) => getComputedStyle(element).backgroundColor,
      );
      document.documentElement.style.setProperty("--brand", "rgb(1, 2, 3)");
      const after = Array.from(document.querySelectorAll("*")).map(
        (element) => getComputedStyle(element).backgroundColor,
      );
      return before.filter((value, index) => value !== after[index]).length;
    });

    await browser.close();
    expect(affected).toBeGreaterThan(0);
  }, 60_000);

  it("(b) still answers a change of width", async () => {
    const { browser, page } = await openSnapshot();

    const widthsDiffer = await (async () => {
      const at = async (width: number) => {
        await page.setViewportSize({ width, height: 900 });
        return page.evaluate(() =>
          Array.from(document.querySelectorAll("*"))
            .map((element) => getComputedStyle(element).gridTemplateColumns)
            .join("|"),
        );
      };
      const wide = await at(1280);
      const narrow = await at(400);
      return wide !== narrow;
    })();

    await browser.close();
    expect(widthsDiffer).toBe(true);
  }, 60_000);

  it("(c) can be walked by the identifiers it was given", async () => {
    const { browser, page } = await openSnapshot();

    const resolved = await page.evaluate(
      ([entries, attribute]) => {
        let matched = 0;
        for (const [id, selector] of entries as [string, string][]) {
          // Identifiers inside a shadow root are addressed through their host,
          // so only the document tree is checked here.
          if (selector.includes("#shadow-")) {
            matched += 1;
            continue;
          }
          const found = document.querySelectorAll(selector);
          if (found.length === 1 && found[0]?.getAttribute(attribute as string) === id) {
            matched += 1;
          }
        }
        return matched;
      },
      [
        Object.entries(map).map(([id, location]) => [id, location.selector]),
        CX_ID_ATTRIBUTE,
      ] as const,
    );

    await browser.close();
    expect(resolved).toBe(Object.keys(map).length);
  }, 60_000);

  it("(d) runs nothing and asks for nothing", async () => {
    const { browser, page, requests } = await openSnapshot();

    const scripts = await page.evaluate(() => document.querySelectorAll("script").length);
    const mutations = await page.evaluate(
      `new Promise((done) => {
        let seen = 0;
        const observer = new MutationObserver((records) => { seen += records.length; });
        observer.observe(document.documentElement, {
          subtree: true, childList: true, attributes: true,
        });
        setTimeout(() => { observer.disconnect(); done(seen); }, 800);
      })`,
    );

    await browser.close();
    expect(scripts).toBe(0);
    expect(requests).toEqual([]);
    expect(mutations).toBe(0);
  }, 60_000);
});
