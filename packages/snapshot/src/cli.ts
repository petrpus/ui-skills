#!/usr/bin/env node
import { chromium } from "playwright";
import { capture, targetUrl } from "./capture.ts";
import { reportClosedShadowRoots } from "./shadow-probe.ts";

const USAGE = `Použití: canvas-snapshot <soubor.html> [--work-dir <adresář>]

  soubor.html   stránka k zachycení (zatím jen lokální soubor)
  --work-dir    kam ukládat session (výchozí: .ui-skills)`;

export function parseArgs(argv: readonly string[]): { input: string; workDir: string } {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const input = positional[0];
  if (input === undefined) {
    throw new Error("chybí cesta k souboru");
  }

  const flagIndex = argv.indexOf("--work-dir");
  const workDir = flagIndex === -1 ? ".ui-skills" : (argv[flagIndex + 1] ?? ".ui-skills");
  return { input, workDir };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  try {
    const { input, workDir } = parseArgs(argv);
    // Pointed at the browser Playwright already manages: the serialiser's own
    // could open local files but reached nothing over the network, and both
    // sides rendering in the same browser is what the comparison assumes.
    const result = capture(input, workDir, { browserExecutablePath: chromium.executablePath() });

    process.stdout.write(
      `✓ snapshot: ${result.snapshotPath}\n` +
        `  ${result.elements} prvků, ${(result.bytes / 1024).toFixed(0)} kB, ` +
        `${(result.milliseconds / 1000).toFixed(1)} s\n` +
        (result.removedActiveParts > 0
          ? `  odstraněno ${result.removedActiveParts} aktivních zbytků\n`
          : ""),
    );

    // A second browser launch per capture, deliberately: the serialiser's
    // run cannot see closed roots at all, so this is the only witness.
    // Never fatal — the snapshot above is already delivered.
    const warning = await reportClosedShadowRoots(targetUrl(input));
    if (warning !== null) {
      process.stderr.write(`${warning}\n`);
    }
  } catch (error) {
    process.stderr.write(`✗ ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
