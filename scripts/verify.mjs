#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATUS_FILE = join(ROOT, "tmp", ".last-verify-status");

const STEPS = [
  ["typecheck", ["pnpm", "run", "typecheck"]],
  ["lint", ["pnpm", "run", "lint"]],
  ["test", ["pnpm", "run", "test"]],
  ["e2e", ["pnpm", "run", "test:e2e"]],
];

function writeStatus(status, failedStep) {
  mkdirSync(dirname(STATUS_FILE), { recursive: true });
  const payload = {
    status,
    at: new Date().toISOString(),
    ...(failedStep ? { failedStep } : {}),
  };
  writeFileSync(STATUS_FILE, `${JSON.stringify(payload)}\n`);
}

for (const [name, [command, ...args]] of STEPS) {
  process.stdout.write(`\n▶ ${name}\n`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    writeStatus("fail", name);
    process.stdout.write(`\n✗ verify selhal ve fázi "${name}"\n`);
    process.exit(result.status ?? 1);
  }
}

writeStatus("ok");
process.stdout.write("\n✓ verify ok\n");
