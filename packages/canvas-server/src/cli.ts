#!/usr/bin/env node
import { serveSession } from "./server.ts";

const USAGE = `Použití: canvas-serve <session> [--port <číslo>]

  session   adresář session se snapshot.html (např. .ui-skills/session-…)
  --port    pevný port (výchozí: volný port přidělí systém)`;

export function parseArgs(argv: readonly string[]): { sessionDir: string; port: number } {
  const flagIndex = argv.indexOf("--port");

  // The flag's value is not a positional argument, whatever the order — with
  // a plain "everything not starting with --" filter, `--port 8080 dir`
  // silently served the session called "8080".
  const portValueIndex = flagIndex === -1 ? -1 : flagIndex + 1;
  const positional = argv.filter((arg, index) => !arg.startsWith("--") && index !== portValueIndex);
  const sessionDir = positional[0];
  if (sessionDir === undefined) {
    throw new Error("chybí cesta k session adresáři");
  }

  if (flagIndex === -1) {
    return { sessionDir, port: 0 };
  }
  const port = Number(argv[flagIndex + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("--port musí být celé číslo 0–65535");
  }
  return { sessionDir, port };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  try {
    const { sessionDir, port } = parseArgs(argv);
    const server = await serveSession(sessionDir, port);

    process.stdout.write(
      `✓ canvas: ${server.url}\n` +
        `  události: POST ${server.url}/events\n` +
        `  uzavření: POST ${server.url}/done\n`,
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
