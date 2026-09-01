#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ReviewError, validateReview } from "@ui-skills/schema";
import { applyReview } from "./apply.ts";
import { readSourceTree } from "./files.ts";
import { renderAppliedMarkdown } from "./report.ts";

const USAGE = `Použití: apply-review <review.json> [--root <adresář>] [--dry-run]

  Promítne review do zdrojových souborů: přímé editace 1:1, všechno
  nejednoznačné končí jako needs-input. Vedle review.json vznikne applied.md.

  review.json   výstup canvas serveru
  --root        kořen zdrojáků, ve kterých se hledá (výchozí: .)
  --dry-run     nic nezapisovat, jen namapovat a vypsat`;

export interface CliArgs {
  readonly reviewPath: string;
  readonly root: string;
  readonly dryRun: boolean;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const rootIndex = argv.indexOf("--root");
  const rootValueIndex = rootIndex === -1 ? -1 : rootIndex + 1;
  const positional = argv.filter((arg, index) => !arg.startsWith("--") && index !== rootValueIndex);
  const reviewPath = positional[0];
  if (reviewPath === undefined) {
    throw new Error("chybí cesta k review.json");
  }
  const root = rootIndex === -1 ? "." : (argv[rootValueIndex] ?? ".");
  return { reviewPath, root, dryRun: argv.includes("--dry-run") };
}

/**
 * The whole CLI behind a testable seam: everything except argv and exit
 * codes. Throws on a rejected review or an unreadable file — the caller
 * turns that into a message and an exit code.
 *
 * A dry run writes nothing at all, the report included: a tool that edits
 * the user's project while printing "nic nezapsáno" burns exactly the trust
 * a review-application tool lives on. The report goes to stdout instead.
 */
export function run(args: CliArgs): string[] {
  const { reviewPath, root, dryRun } = args;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(reviewPath, "utf8"));
  } catch (error) {
    throw new Error(`review se nedá načíst: ${(error as Error).message}`);
  }
  // Unknown schemaVersion is rejected here with the validator's own
  // explanation — applying a document we only half understand would edit
  // source files on a guess.
  const review = validateReview(parsed);

  const reportPath = join(dirname(resolve(reviewPath)), "applied.md");
  const result = applyReview(
    review,
    readSourceTree(resolve(root), new Set([resolve(reviewPath), reportPath])),
  );

  const lines: string[] = [];
  for (const change of result.changes) {
    const location = change.location === undefined ? "" : ` ${change.location}`;
    const note = change.note === "" ? "" : ` — ${change.note}`;
    lines.push(`  ${change.status.padEnd(11)} ${change.id}${location}${note}`);
  }
  for (const comment of result.comments) {
    lines.push(
      `  ${comment.action.padEnd(11)} ${comment.id}${comment.location === undefined ? "" : ` ${comment.location}`}`,
    );
  }

  const { applied, needsInput, skipped } = result.ratio;
  const ratio = `applied ${applied} / needs-input ${needsInput} / skipped ${skipped}`;

  if (dryRun) {
    lines.push("", renderAppliedMarkdown(result, reviewPath));
    lines.push(`✓ dry-run (nic nezapsáno): ${ratio}`);
    return lines;
  }

  for (const [path, content] of result.updates) {
    writeFileSync(join(resolve(root), path), content);
  }
  writeFileSync(reportPath, renderAppliedMarkdown(result, reviewPath));
  lines.push(`✓ aplikováno: ${ratio}`, `  report: ${reportPath}`);
  return lines;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  try {
    process.stdout.write(`${run(parseArgs(argv)).join("\n")}\n`);
  } catch (error) {
    const prefix = error instanceof ReviewError ? "review odmítnuto" : "chyba";
    process.stderr.write(`✗ ${prefix}: ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
