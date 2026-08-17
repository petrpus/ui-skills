#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type Browser, chromium } from "playwright";
import {
  checkSelectors,
  contentOutline,
  countMutations,
  countScripts,
  declaredCustomProperties,
  overridableProperties,
  referencedCustomProperties,
  respondsToViewport,
  sampleSelectors,
} from "./probes.ts";

/**
 * The spike from issue #2, as a script rather than a session of manual poking.
 *
 * Whether SingleFile can carry this project is worth weeks of work either way,
 * so the answer should be reproducible on another page and another day. Run it
 * again on your own application and it will tell you the same four things.
 *
 * SingleFile is AGPL and is only ever spawned, never imported — see CLAUDE.md.
 *
 * The verdict this produced is written down in docs/adr/0001-snapshot-engine.md.
 * Run it again on your own application before trusting that verdict for it.
 */

const NARROW_QUERY = "(max-width: 600px)";
const SAMPLE_SIZE = 20;

interface Args {
  readonly target: string;
  readonly outDir: string;
}

function parseArgs(argv: readonly string[]): Args {
  const target = argv[0];
  if (target === undefined) {
    throw new Error("použití: run.ts <url|soubor> [--out <adresář>]");
  }
  const outIndex = argv.indexOf("--out");
  const outDir = outIndex === -1 ? "tmp/spike" : (argv[outIndex + 1] ?? "tmp/spike");
  return { target, outDir };
}

function asUrl(target: string): string {
  return /^https?:\/\//i.test(target) ? target : pathToFileURL(resolve(target)).href;
}

interface Capture {
  readonly path: string;
  readonly bytes: number;
  readonly milliseconds: number;
}

function capture(targetUrl: string, outPath: string): Capture {
  mkdirSync(dirname(outPath), { recursive: true });

  // It never overwrites: an existing target makes it write `snapshot (1).html`
  // beside it and exit 0. A script that then reads the original path measures
  // the first capture it ever made, however many times it is re-run — which is
  // how a fixture edited minutes earlier still produced the old numbers.
  rmSync(dirname(outPath), { recursive: true, force: true });
  mkdirSync(dirname(outPath), { recursive: true });

  const started = Date.now();

  // The locally installed binary, spawned — never imported. Fetching it per run
  // instead made the spike slower than the thing it measures.
  const result = spawnSync(
    resolve("node_modules/.bin/single-file"),
    [
      targetUrl,
      outPath,
      // Its own browser could open local files but reached nothing over the
      // network here, failing every URL with a bare "fetch failed". Pointed at
      // the browser Playwright already manages, it works — and the two then
      // agree on what they render, which is what the comparison assumes anyway.
      "--browser-executable-path",
      chromium.executablePath(),
      // The value is case-sensitive and unknown values are not rejected: they
      // fall into a retry chain that waits out `--browser-load-max-time` for
      // each candidate. A typo here cost 68s per capture instead of 4s.
      "--browser-wait-until",
      "networkIdle",
      "--browser-load-max-time",
      "60000",
    ],
    { encoding: "utf8", timeout: 180_000 },
  );

  // A failed capture still exits 0 and simply writes nothing — a redirect it
  // will not follow looks exactly like success until the file is missing.
  if (result.status !== 0 || !existsSync(outPath)) {
    const output = [result.stdout, result.stderr].filter(Boolean).join(" ").trim();
    throw new Error(`single-file nic nezachytil: ${output || "bez výstupu"}`);
  }

  const written = statSync(outPath);
  if (written.mtimeMs < started) {
    throw new Error(`${outPath} je starší než tenhle běh — měřilo by se něco jiného`);
  }

  return {
    path: outPath,
    bytes: statSync(outPath).size,
    milliseconds: Date.now() - started,
  };
}

/**
 * How much of one outline appears in the other, in order.
 *
 * Comparing index by index was the wrong measure: a single element inserted
 * near the top of a 1500-element page misaligns everything below it and reports
 * near-total mismatch for a page that is almost identical. A longest common
 * subsequence tolerates insertions and deletions and still insists on order.
 */
function longestCommonRun(left: readonly string[], right: readonly string[]): number {
  let previous = new Uint32Array(right.length + 1);
  let current = new Uint32Array(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      current[j] =
        left[i - 1] === right[j - 1]
          ? (previous[j - 1] ?? 0) + 1
          : Math.max(previous[j] ?? 0, current[j - 1] ?? 0);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }
  return previous[right.length] ?? 0;
}

function verdictLine(label: string, passed: boolean, detail: string): string {
  return `${passed ? "PASS" : "FAIL"}  ${label.padEnd(34)} ${detail}`;
}

async function main(): Promise<void> {
  const { target, outDir } = parseArgs(process.argv.slice(2));
  const targetUrl = asUrl(target);
  const snapshotPath = resolve(outDir, "snapshot.html");

  process.stdout.write(`Cíl: ${targetUrl}\n`);
  const captured = capture(targetUrl, snapshotPath);
  process.stdout.write(
    `Snapshot: ${(captured.bytes / 1024).toFixed(0)} kB za ${(captured.milliseconds / 1000).toFixed(1)} s\n\n`,
  );

  const browser = await chromium.launch();
  try {
    await measure(browser, targetUrl, snapshotPath, captured);
  } finally {
    // Without this, a probe that throws leaves the browser open and the process
    // alive — which reads as a hang and hides the error that caused it.
    await browser.close();
  }
}

/**
 * esbuild wraps transpiled functions in a `__name` helper to preserve their
 * names. `page.evaluate` ships the function's source to the browser, where that
 * helper does not exist, so every probe would die on `__name is not defined`.
 * Injected as raw text rather than a function, or it would be transpiled too.
 */
const NAME_SHIM = "globalThis.__name = globalThis.__name || ((fn) => fn);";

async function measure(
  browser: Browser,
  targetUrl: string,
  snapshotPath: string,
  captured: Capture,
): Promise<void> {
  const context = await browser.newContext();
  await context.addInitScript({ content: NAME_SHIM });

  const original = await context.newPage();
  await original.goto(targetUrl, { waitUntil: "networkidle" });
  const originalProperties = await declaredCustomProperties(original);
  const originalSelectors = await sampleSelectors(original, SAMPLE_SIZE);
  const originalViewport = await respondsToViewport(original, NARROW_QUERY);
  const originalOutline = await contentOutline(original);
  await original.close();

  // The same page loaded twice, to find out how much it disagrees with itself.
  // Without this number, any difference between the original and the copy looks
  // like something the serialiser lost — on a live application, much of it is
  // just the page not being the same page twice.
  const again = await context.newPage();
  await again.goto(targetUrl, { waitUntil: "networkidle" });
  const secondOutline = await contentOutline(again);
  await again.close();

  const copy = await context.newPage();
  const requests: string[] = [];
  copy.on("request", (request) => {
    if (!request.url().startsWith("data:") && !request.url().startsWith("file:")) {
      requests.push(request.url());
    }
  });
  await copy.goto(pathToFileURL(snapshotPath).href, { waitUntil: "load" });

  const copyProperties = await declaredCustomProperties(copy);
  // Sampled from the properties the page actually reads, not the first dozen it
  // happens to declare — otherwise the criterion turns on stylesheet order.
  const referenced = await referencedCustomProperties(copy);
  const sample = referenced.filter((name) => copyProperties.includes(name)).slice(0, 12);
  const overrides = await overridableProperties(
    copy,
    sample.length > 0 ? sample : copyProperties.slice(0, 12),
  );
  const copyViewport = await respondsToViewport(copy, NARROW_QUERY);
  await copy.setViewportSize({ width: 1280, height: 900 });
  const selectors = await checkSelectors(copy, originalSelectors);
  const copyOutline = await contentOutline(copy);
  const scripts = await countScripts(copy);
  const mutations = await countMutations(copy, 1200);

  const survivingProperties = copyProperties.filter((name) => originalProperties.includes(name));
  const repainting = overrides.filter((entry) => entry.affected > 0);
  // Judged on how much of the original's responsiveness the copy keeps, not on
  // a boolean. matchMedia flipping only says the breakpoint text survived, and
  // a hidden-count that moves says almost nothing without a floor to read it
  // against — the same "ano" hiding a number that criterion (a) used to have.
  const viewportRetention =
    originalViewport.changedElements === 0
      ? 1
      : copyViewport.changedElements / originalViewport.changedElements;
  const viewportAlive =
    copyViewport.narrowMatches && !copyViewport.wideMatches && viewportRetention >= 0.5;
  const originalViewportAlive = originalViewport.changedElements > 0;
  const selectorRate = selectors.matched / Math.max(1, originalSelectors.length);
  const outlineMatches = longestCommonRun(originalOutline, copyOutline);
  const outlineRate = outlineMatches / Math.max(1, originalOutline.length);
  const noiseMatches = longestCommonRun(originalOutline, secondOutline);
  const noiseRate = noiseMatches / Math.max(1, originalOutline.length);
  // Judged against how faithful the page is to itself, not against perfection.
  const outlineVerdict = outlineRate >= Math.min(0.95, noiseRate - 0.05);
  const inert = requests.length === 0 && mutations === 0;

  process.stdout.write(
    [
      verdictLine(
        "(a) custom properties přežily",
        survivingProperties.length > 0 || originalProperties.length === 0,
        `${survivingProperties.length} z ${originalProperties.length} deklarovaných`,
      ),
      verdictLine(
        "(a) a jsou přepsatelné",
        repainting.length > 0,
        `${repainting.length} z ${overrides.length} zkoušených něco změní` +
          (repainting.length > 0
            ? ` (nejvíc ${Math.max(...repainting.map((entry) => entry.affected))} prvků)`
            : ""),
      ),
      verdictLine(
        "(b) media queries reagují",
        viewportAlive || !originalViewportAlive,
        originalViewportAlive
          ? `${copyViewport.changedElements} z ${originalViewport.changedElements} reagujících prvků (${(viewportRetention * 100).toFixed(0)} %), skrytých ${copyViewport.hiddenWide}→${copyViewport.hiddenNarrow}`
          : "originál sám na šířku nereaguje — nelze rozhodnout",
      ),
      verdictLine(
        "(c) obsahová kostra sedí",
        outlineVerdict,
        `${(outlineRate * 100).toFixed(1)} % ve shodném pořadí — sama se sebou se stránka shodne na ${(noiseRate * 100).toFixed(1)} %`,
      ),
      // Reported, not judged. Positional selectors shift because the serialiser
      // drops scripts, which is expected — instrumentation runs on the copy, so
      // it never carries a selector across. The number is here so nobody builds
      // on the assumption that it would.
      `      selektory přenesené z originálu:  ${selectors.matched}/${originalSelectors.length} (posun indexů po odstranění skriptů je normální)`,
      verdictLine(
        "(d) kopie je netečná",
        inert,
        `${scripts} skriptů, ${requests.length} síťových požadavků, ${mutations} změn DOM za 1,2 s`,
      ),
      "",
      `Velikost: ${(captured.bytes / 1024).toFixed(0)} kB · pořízení: ${(captured.milliseconds / 1000).toFixed(1)} s`,
      requests.length > 0 ? `Požadavky ven: ${requests.slice(0, 5).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  process.stdout.write("\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`✗ ${(error as Error).message}\n`);
  process.exitCode = 1;
});
