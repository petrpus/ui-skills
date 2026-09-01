#!/usr/bin/env node
import { capture } from "@ui-skills/snapshot";
import { chromium } from "playwright";
import { serveSession } from "./server.ts";

const USAGE = `Použití: ui-review <soubor.html> [--work-dir <adresář>] [--port <číslo>]

  Zachytí stránku, naservíruje ji s editorem a počká, než člověk review
  uzavře („Hotovo" nebo Ctrl+Enter). Pak vypíše cestu k review.json.

  soubor.html   stránka k review (zatím jen lokální soubor)
  --work-dir    kam ukládat session (výchozí: .ui-skills)
  --port        pevný port (výchozí: volný port přidělí systém)`;

export interface UiReviewArgs {
  readonly input: string;
  readonly workDir: string;
  readonly port: number;
}

export function parseArgs(argv: readonly string[]): UiReviewArgs {
  const flagValueIndexes = new Set(
    ["--work-dir", "--port"]
      .map((flag) => argv.indexOf(flag))
      .filter((index) => index !== -1)
      .map((index) => index + 1),
  );
  const positional = argv.filter(
    (arg, index) => !arg.startsWith("--") && !flagValueIndexes.has(index),
  );
  const input = positional[0];
  if (input === undefined) {
    throw new Error("chybí cesta k souboru");
  }

  const workDirIndex = argv.indexOf("--work-dir");
  const workDir = workDirIndex === -1 ? ".ui-skills" : (argv[workDirIndex + 1] ?? ".ui-skills");

  const portIndex = argv.indexOf("--port");
  let port = 0;
  if (portIndex !== -1) {
    port = Number(argv[portIndex + 1]);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error("--port musí být celé číslo 0–65535");
    }
  }

  return { input, workDir, port };
}

/**
 * The whole phase-0 loop as one command: capture, serve, wait for a human,
 * hand the agent a path to act on. The pieces stay separate commands too —
 * this only strings them together.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  try {
    const { input, workDir, port } = parseArgs(argv);

    const captured = capture(input, workDir, {
      browserExecutablePath: chromium.executablePath(),
    });
    process.stdout.write(`✓ snapshot: ${captured.snapshotPath} (${captured.elements} prvků)\n`);

    const server = await serveSession(captured.sessionDir, port);
    process.stdout.write(
      `✓ canvas: ${server.url}\n` +
        `  otevřete v prohlížeči; „Hotovo" nebo Ctrl+Enter review uzavře\n`,
    );

    const result = await server.done;
    for (const warning of result.warnings) {
      process.stderr.write(`⚠ ${warning}\n`);
    }
    process.stdout.write(
      `✓ review: ${result.reviewPath}\n` +
        `  ${result.changes} změn, ${result.comments} komentářů, souhrn: ${result.markdownPath}\n`,
    );
  } catch (error) {
    process.stderr.write(`✗ ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
