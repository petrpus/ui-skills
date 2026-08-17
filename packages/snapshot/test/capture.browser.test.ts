import { existsSync, readFileSync, rmSync } from "node:fs";
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

  it("(c) every selector resolves to the element it was recorded for", async () => {
    // Shadow elements are resolved here rather than waved through. An earlier
    // version skipped anything inside a shadow root and counted it as matched,
    // so it reported total success on the one input where the identifiers
    // resolved to nothing at all.
    const { browser, page } = await openSnapshot();

    const failures = await page.evaluate(
      ([entries, attribute]) => {
        const problems: string[] = [];

        for (const [id, hostPath, selector] of entries as [string, string[], string][]) {
          let root: Document | ShadowRoot = document;
          let reachable = true;

          for (const hostSelector of hostPath) {
            const host: Element | null = root.querySelector(hostSelector);
            if (host?.shadowRoot == null) {
              problems.push(`${id}: hostitel ${hostSelector} nemá shadow root`);
              reachable = false;
              break;
            }
            root = host.shadowRoot;
          }
          if (!reachable) {
            continue;
          }

          const found = root.querySelectorAll(selector);
          if (found.length !== 1) {
            problems.push(`${id}: ${found.length} shod pro ${selector}`);
          } else if (found[0]?.getAttribute(attribute as string) !== id) {
            problems.push(`${id}: selektor našel jiný prvek`);
          }
        }
        return problems;
      },
      [
        Object.entries(map).map(([id, location]) => [id, location.hostPath, location.selector]),
        CX_ID_ATTRIBUTE,
      ] as const,
    );

    await browser.close();
    expect(failures).toEqual([]);
  }, 60_000);

  it("(c) every xpath resolves to the element it was recorded for", async () => {
    // Asserted by evaluating it, not by matching its shape. A shape assertion
    // once locked in a bug: lowercasing every step made camelCase SVG names
    // like foreignObject unresolvable, and the regex demanded the lowercase.
    const { browser, page } = await openSnapshot();

    const failures = await page.evaluate(
      ([entries, attribute]) => {
        const problems: string[] = [];

        for (const [id, xpath] of entries as [string, string][]) {
          let node: Node | null = null;
          try {
            node = document.evaluate(xpath, document, null, 9, null).singleNodeValue;
          } catch (error) {
            problems.push(`${id}: ${xpath} není platný xpath — ${(error as Error).message}`);
            continue;
          }
          if ((node as Element | null)?.getAttribute(attribute as string) !== id) {
            problems.push(`${id}: ${xpath} vede jinam`);
          }
        }
        return problems;
      },
      [
        Object.entries(map)
          .filter(([, location]) => location.xpath !== undefined)
          .map(([id, location]) => [id, location.xpath]),
        CX_ID_ATTRIBUTE,
      ] as const,
    );

    await browser.close();
    expect(failures).toEqual([]);
  }, 60_000);

  it("(c) an element without an xpath says which hosts to open instead", () => {
    const withoutXpath = Object.entries(map).filter(([, location]) => location.xpath === undefined);

    for (const [id, location] of withoutXpath) {
      expect(location.hostPath.length, id).toBeGreaterThan(0);
    }
  });

  it("loses what a closed shadow root holds — a limitation, recorded so it is noticed", () => {
    // The fixture builds one with attachShadow({ mode: "closed" }). The
    // serialiser reads shadow content through `host.shadowRoot`, which answers
    // null for a closed root, so the content never reaches the snapshot: a page
    // using closed roots is reviewed with pieces missing and nothing says so.
    // Tracked as an issue; asserted here so that a serialiser which starts
    // capturing them fails this test instead of surprising someone.
    const snapshot = readFileSync(result.snapshotPath, "utf8");

    expect(snapshot).toContain("Odstavec ve stínovém stromu.");
    expect(snapshot).not.toContain("Odstavec v zavřeném stromu.");
  });

  it("(d) carries no way to execute, even without a script tag", async () => {
    // The fixture ships the paths that need no script element: an executable
    // href, a ping, and a frame whose inlined document runs on load. Unit tests
    // cover the filter; this checks what actually ends up in the file.
    const snapshot = readFileSync(result.snapshotPath, "utf8");

    expect(snapshot).not.toMatch(/javascript:/i);
    expect(snapshot).toMatch(/<iframe[^>]*sandbox=""/);
  });

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
