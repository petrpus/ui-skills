import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The one seam the unit tests cannot see: the CLI must run the preflight
 * BEFORE the capture. The proof is behavioural — a 404 must fail fast with
 * the preflight's message and leave no session directory behind. If someone
 * reorders the calls, the serialiser runs first, a session dir appears and
 * the error degrades to the uninformative one; both assertions catch it.
 */

const ROOT = resolve(import.meta.dirname, "../../..");

let server: Server;
let base: string;
let workDir: string;

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "cli-preflight-"));
  server = createServer((_request, response) => {
    response.writeHead(404);
    response.end("not found");
  });
  await new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", () => done());
  });
  const address = server.address();
  base = typeof address === "object" && address !== null ? `http://127.0.0.1:${address.port}` : "";
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => {
    server.close(() => done());
  });
  rmSync(workDir, { recursive: true, force: true });
});

describe("canvas-snapshot CLI", () => {
  it("404 zastaví běh před zachycením: preflight hláška, žádná session", async () => {
    // Async spawn: a blocking wait would freeze the in-process test server
    // and turn every request into a timeout.
    const child = spawn(
      join(ROOT, "node_modules/.bin/tsx"),
      ["packages/snapshot/src/cli.ts", `${base}/chybi.html`, "--work-dir", workDir],
      { cwd: ROOT },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const status = await new Promise<number | null>((done) => {
      child.on("exit", (code) => done(code));
    });

    expect(status).toBe(1);
    expect(stderr).toContain("HTTP 404");
    expect(existsSync(join(workDir))).toBe(true);
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(workDir)).toEqual([]);
  }, 60_000);
});
