import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { instrument } from "./instrument.ts";
import { looksLikeLoginPage } from "./preflight.ts";
import { sanitize } from "./sanitize.ts";

/**
 * Every setting here was paid for by the spike; the reasons are in
 * docs/adr/0001-snapshot-engine.md. None of them is a preference.
 */
interface SingleFileOptions {
  /** A browser that can reach the network. Its own could open files but not URLs. */
  readonly browserExecutablePath?: string;
  readonly loadMaxTimeMs?: number;
  /** Overridable so the guards below can be tested without a browser. */
  readonly singleFileBinary?: string;
}

export interface CaptureResult {
  readonly sessionDir: string;
  readonly snapshotPath: string;
  readonly mapPath: string;
  readonly elements: number;
  readonly removedActiveParts: number;
  readonly bytes: number;
  readonly milliseconds: number;
  /** Best-effort: the capture resembles a login screen (see preflight.ts). */
  readonly looksLikeLogin: boolean;
}

function sessionName(now: Date): string {
  return `session-${now.toISOString().replace(/[:.]/g, "-")}`;
}

/** Exported for the shadow probe: both must open the very same address. */
export function targetUrl(input: string): string {
  return /^https?:\/\//i.test(input) ? input : pathToFileURL(resolve(input)).href;
}

function runSingleFile(url: string, outPath: string, options: SingleFileOptions): void {
  const args = [
    url,
    outPath,
    // Case-sensitive, and an unknown value is not rejected: it falls into a
    // retry chain that waits out the load timeout for each candidate. A typo
    // here cost 68 seconds per capture instead of four.
    "--browser-wait-until",
    "networkIdle",
    "--browser-load-max-time",
    String(options.loadMaxTimeMs ?? 60_000),
  ];

  // A short grace after networkIdle, for URLs only: lazy content that fires
  // right after idle still makes it in, a local file has nothing to wait
  // for. Below-the-fold lazy loading stays out of scope — that is #37.
  if (/^https?:\/\//i.test(url)) {
    args.push("--browser-wait-delay", "1000");
  }

  if (options.browserExecutablePath !== undefined) {
    args.push("--browser-executable-path", options.browserExecutablePath);
  }

  const binary = options.singleFileBinary ?? resolve("node_modules/.bin/single-file");
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    timeout: 180_000,
  });

  // A failed capture exits 0 and writes nothing — a redirect it will not follow
  // looks exactly like success until the file turns out to be missing.
  if (result.status !== 0 || !existsSync(outPath)) {
    const output = [result.stdout, result.stderr].filter(Boolean).join(" ").trim();
    throw new Error(`snapshot se nepořídil: ${output || "nástroj neřekl proč"}`);
  }
}

/**
 * Freezes a page into one self-contained file, strips whatever could still run
 * in it, and gives every element an identifier.
 *
 * Deliberately synchronous, which also means no preflight: the CLIs await
 * `preflightUrl` before calling this, and a library caller must do the same
 * or live with the serialiser's uninformative failure mode.
 *
 * The order matters. Instrumentation runs on the copy, never on the original:
 * serialisation removes scripts, so positions computed on the live page do not
 * hold afterwards — measured at nought out of twenty on a real application.
 */
export function capture(
  input: string,
  workDir = ".ui-skills",
  options: SingleFileOptions = {},
  now = new Date(),
): CaptureResult {
  const sessionDir = resolve(workDir, sessionName(now));
  const snapshotPath = join(sessionDir, "snapshot.html");
  const mapPath = join(sessionDir, "map.json");

  // The serialiser never overwrites: given an existing target it writes
  // `snapshot (1).html` beside it and exits 0, so a stale file would be read
  // back as if it were this run's work.
  rmSync(sessionDir, { recursive: true, force: true });
  mkdirSync(sessionDir, { recursive: true });

  const started = Date.now();
  runSingleFile(targetUrl(input), snapshotPath, options);

  if (statSync(snapshotPath).mtimeMs < started) {
    throw new Error(`${snapshotPath} je starší než tenhle běh — nezachytilo se nic nového`);
  }

  const captured = readFileSync(snapshotPath, "utf8");
  const cleaned = sanitize(captured);
  const instrumented = instrument(cleaned.html);

  writeFileSync(snapshotPath, instrumented.html);
  writeFileSync(mapPath, `${JSON.stringify(instrumented.map, null, 2)}\n`);
  // Where the session came from, for review.json's meta: the session dir is
  // the hand-off between capture and server, so provenance rides with it.
  writeFileSync(
    join(sessionDir, "session.json"),
    `${JSON.stringify({ source: input, capturedAt: now.toISOString() }, null, 2)}\n`,
  );

  return {
    sessionDir,
    snapshotPath,
    mapPath,
    elements: instrumented.count,
    removedActiveParts: cleaned.removed,
    bytes: statSync(snapshotPath).size,
    milliseconds: Date.now() - started,
    looksLikeLogin: looksLikeLoginPage(captured, input),
  };
}
