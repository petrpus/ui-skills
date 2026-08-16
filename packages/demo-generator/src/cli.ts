#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { resolveTokens, TokensError, validateTokens } from "@ui-skills/schema";
import { renderDemo } from "./render.ts";

const USAGE = `Použití: design-demo [tokens.json] [--out <soubor>]

  tokens.json   cesta k souboru s tokeny (výchozí: ./tokens.json)
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

function readTokensFile(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`tokens.json nenalezen: ${path}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`tokens.json není platný JSON: ${(error as Error).message}`);
  }
}

export function run(argv: readonly string[]): string {
  const { tokensPath, outPath } = parseArgs(argv);
  const tokens = resolveTokens(validateTokens(readTokensFile(resolve(tokensPath))));
  const target = resolveOutPath(tokensPath, outPath);

  writeFileSync(target, renderDemo(tokens));
  return target;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  try {
    const target = run(argv);
    process.stdout.write(`✓ demo vygenerováno: ${target}\n`);
  } catch (error) {
    const message = error instanceof TokensError ? error.message : (error as Error).message;
    process.stderr.write(`✗ ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
