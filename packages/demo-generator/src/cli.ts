#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { resolveTokens, TokensError, validateTokens } from "@ui-skills/schema";
import { renderDemo } from "./render.ts";
import { serializeStarter } from "./starter.ts";

const USAGE = `Použití: design-demo [tokens.json] [--out <soubor>]

  tokens.json   cesta k souboru s tokeny (výchozí: ./tokens.json)
                když soubor neexistuje, založí se základ k přepsání
  --out         kam zapsat demo (výchozí: demo.html vedle tokens.json)`;

export interface CliArgs {
  readonly tokensPath: string;
  readonly outPath: string | undefined;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  let tokensPath: string | undefined;
  let outPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error("--out vyžaduje cestu k souboru");
      }
      outPath = next;
      i += 1;
    } else if (arg !== undefined && arg.startsWith("--")) {
      throw new Error(`neznámý přepínač ${arg}`);
    } else if (arg !== undefined) {
      if (tokensPath !== undefined) {
        throw new Error("očekávána nejvýše jedna cesta k tokens.json");
      }
      tokensPath = arg;
    }
  }

  return { tokensPath: tokensPath ?? "tokens.json", outPath };
}

/** Without `--out` the demo lands beside its tokens, so the pair travels together. */
export function resolveOutPath(tokensPath: string, outPath: string | undefined): string {
  if (outPath === undefined) {
    return join(dirname(resolve(tokensPath)), "demo.html");
  }
  return isAbsolute(outPath) ? outPath : resolve(outPath);
}

function parseTokensFile(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`tokens.json není platný JSON: ${(error as Error).message}`);
  }
}

/**
 * Reads the tokens, writing a starter first if there is nothing to read.
 *
 * A missing file is the first run, not a mistake, and answering it with an
 * error hands someone an hour of transcribing JSON before they see anything.
 * The starter is neutral and meant to be overwritten.
 *
 * Uses an exclusive write rather than checking for the file first: the check
 * and the write would be two moments, and only the filesystem can make them
 * one. An existing tokens.json is the author's own work and must never be lost
 * to this.
 */
function readOrCreateTokens(path: string): { raw: string; created: boolean } {
  try {
    return { raw: readFileSync(path, "utf8"), created: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`tokens.json nelze přečíst: ${(error as Error).message}`);
    }
  }

  const starter = serializeStarter();

  // Checked before it is written, not only in the test suite. A tool that
  // leaves behind a file its own validator rejects is worse than one that
  // writes nothing, and that promise should not rest on someone remembering
  // to run the tests after editing the starter.
  try {
    validateTokens(JSON.parse(starter));
  } catch (error) {
    throw new Error(`základ tokens.json je vadný a nebyl zapsán: ${(error as Error).message}`);
  }

  try {
    writeFileSync(path, starter, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw new Error(`tokens.json nelze založit: ${(error as Error).message}`);
    }

    // Something is at the path that the read could not see. Either another
    // process won the race — read what it wrote — or the path is a symlink
    // going nowhere, which an exclusive create refuses whether or not its
    // target exists.
    try {
      return { raw: readFileSync(path, "utf8"), created: false };
    } catch {
      throw new Error(
        `na cestě ${path} něco je, ale nejde to přečíst — nejspíš symlink, ` +
          `který nikam nevede. Nic jsem nepřepsal.`,
      );
    }
  }

  return { raw: starter, created: true };
}

export interface RunResult {
  readonly demoPath: string;
  readonly tokensPath: string;
  /** True when this run had to write the starter, i.e. the first run in a project. */
  readonly createdStarter: boolean;
}

export function run(argv: readonly string[]): RunResult {
  const { tokensPath, outPath } = parseArgs(argv);
  const absoluteTokens = resolve(tokensPath);
  const { raw, created } = readOrCreateTokens(absoluteTokens);
  const tokens = resolveTokens(validateTokens(parseTokensFile(raw)));
  const target = resolveOutPath(tokensPath, outPath);

  writeFileSync(target, renderDemo(tokens));
  return { demoPath: target, tokensPath: absoluteTokens, createdStarter: created };
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  try {
    const { demoPath, tokensPath, createdStarter } = run(argv);
    if (createdStarter) {
      process.stdout.write(
        `tokens.json nenalezen — zakládám základ k přepsání\n` +
          `  ✓ ${tokensPath}\n` +
          `  ✓ ${demoPath}\n\n` +
          `Přepiš hodnoty v tokens.json svými a spusť znovu.\n`,
      );
      return;
    }
    process.stdout.write(`✓ demo vygenerováno: ${demoPath}\n`);
  } catch (error) {
    const message = error instanceof TokensError ? error.message : (error as Error).message;
    process.stderr.write(`✗ ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
