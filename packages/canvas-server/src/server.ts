import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReview } from "@ui-skills/schema";
import { compileReview, renderReviewMarkdown } from "./compile.ts";
import { parseEventLog } from "./events.ts";
import { parseLocationMap } from "./location-map.ts";

export interface DoneResult {
  readonly reviewPath: string;
  readonly markdownPath: string;
  readonly warnings: readonly string[];
  readonly changes: number;
  readonly comments: number;
}

export interface CanvasServer {
  readonly port: number;
  readonly url: string;
  /**
   * Settles once /done has run and the server has shut down: resolves with
   * the compiled review, rejects when compilation failed. It never stays
   * pending past /done — a hung process would be worse than a failed one,
   * and the log survives on disk for another run either way.
   */
  readonly done: Promise<DoneResult>;
  close(): Promise<void>;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

const OVERLAY_PATH = fileURLToPath(new URL("../overlay/overlay.js", import.meta.url));

/**
 * External on purpose: with the boot in its own file, the served copy needs
 * no inline-script allowance at all — the rewritten CSP below can stay at
 * `script-src 'self'`.
 */
const OVERLAY_BOOT = 'import { initOverlay } from "/overlay.js";\ninitOverlay(window);\n';

const OVERLAY_BOOTSTRAP = '<script type="module" src="/overlay-boot.js"></script>';

// Global: policies from several meta tags combine restrictively, so one
// surviving original would re-block the overlay despite the rewrite.
const CSP_META_PATTERN = /<meta[^>]*http-equiv=["']content-security-policy["'][^>]*>/gi;

/**
 * The serialiser stamps snapshots with `default-src 'none'; script-src
 * 'unsafe-inline' data:` — the right policy for a frozen file opened from
 * disk, and exactly the wrong one for this server's copy, where it blocks
 * the overlay module and every POST /events. The served copy therefore gets
 * a policy that allows same-origin scripts and connections and nothing
 * else — stricter about inline script than the original, not looser.
 */
const SERVED_CSP =
  '<meta http-equiv="content-security-policy" content="default-src \'none\'; ' +
  "font-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline'; " +
  "media-src 'self' data:; script-src 'self'; connect-src 'self'; " +
  "object-src 'none'; frame-src 'self' data:;\">";

/**
 * The overlay goes in at request time, never into the stored file: the
 * snapshot on disk stays exactly what was captured, so re-serving, diffing
 * or re-instrumenting it later starts from clean ground.
 */
function withOverlay(html: string): string {
  const rewritten = html.replace(CSP_META_PATTERN, SERVED_CSP);
  const closing = rewritten.toLowerCase().lastIndexOf("</body>");
  if (closing === -1) {
    return rewritten + OVERLAY_BOOTSTRAP;
  }
  return rewritten.slice(0, closing) + OVERLAY_BOOTSTRAP + rewritten.slice(closing);
}

function respondJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload)}\n`);
}

/**
 * Compiles from what the disk says, never from what the process remembers.
 * The log is the source of truth precisely so that this call still works in a
 * later process that saw none of the events arrive.
 */
function compileFromDisk(sessionDir: string): DoneResult {
  const logPath = join(sessionDir, "events.jsonl");
  const raw = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  const { events, warnings } = parseEventLog(raw);

  const mapPath = join(sessionDir, "map.json");
  const map = existsSync(mapPath) ? parseLocationMap(readFileSync(mapPath, "utf8")) : {};

  const review = compileReview(events, map);
  // The contract is validated on the way out, not assumed: a compiler bug
  // should fail here, loudly, not in the apply step days later.
  validateReview(review);

  const reviewPath = join(sessionDir, "review.json");
  const markdownPath = join(sessionDir, "review.md");
  writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
  writeFileSync(markdownPath, renderReviewMarkdown(review));

  return {
    reviewPath,
    markdownPath,
    warnings,
    changes: review.changes.length,
    comments: review.comments.length,
  };
}

/**
 * Serves an instrumented session over bare `node:http` — no framework, per
 * the spec's dependency budget. Three endpoints: GET / hands out the
 * snapshot, POST /events appends one line to the JSONL log the moment it
 * arrives, POST /done compiles the log into review.json + review.md and
 * shuts the server down.
 */
export function serveSession(sessionDir: string, port = 0): Promise<CanvasServer> {
  const snapshotPath = join(sessionDir, "snapshot.html");
  if (!existsSync(snapshotPath)) {
    return Promise.reject(
      new Error(`v ${sessionDir} není snapshot.html — nejdřív canvas-snapshot`),
    );
  }

  let settleDone: { resolve(result: DoneResult): void; reject(error: Error): void };
  const done = new Promise<DoneResult>((resolve, reject) => {
    settleDone = { resolve, reject };
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;

    if (request.method === "GET" && path === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(withOverlay(readFileSync(snapshotPath, "utf8")));
      return;
    }

    if (request.method === "GET" && path === "/overlay.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(readFileSync(OVERLAY_PATH));
      return;
    }

    if (request.method === "GET" && path === "/overlay-boot.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(OVERLAY_BOOT);
      return;
    }

    if (request.method === "POST" && path === "/events") {
      const body = await readBody(request);
      let event: unknown;
      try {
        event = JSON.parse(body);
      } catch {
        respondJson(response, 400, { error: "tělo musí být platný JSON" });
        return;
      }
      if (typeof event !== "object" || event === null || Array.isArray(event)) {
        respondJson(response, 400, { error: "událost musí být objekt" });
        return;
      }
      // Synchronous append: by the time the editor hears 204, the line is
      // out of this process's hands. A crash after that loses nothing.
      appendFileSync(join(sessionDir, "events.jsonl"), `${JSON.stringify(event)}\n`);
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === "POST" && path === "/done") {
      let result: DoneResult;
      try {
        result = compileFromDisk(sessionDir);
      } catch (error) {
        // A failed compilation still ends the session — the alternative is a
        // server that hangs forever behind a 500. The log stays on disk, so
        // fixing the cause and serving the session again loses nothing.
        const message = (error as Error).message;
        respondJson(response, 500, { error: message });
        server.close(() => settleDone.reject(new Error(`review se nesložilo: ${message}`)));
        return;
      }
      respondJson(response, 200, result);
      server.close(() => settleDone.resolve(result));
      return;
    }

    respondJson(response, 404, { error: `neznámá cesta ${request.method} ${path}` });
  }

  const server = createServer((request, response) => {
    // The handler's rejection must never reach the event loop unhandled: one
    // client dropping mid-upload would take down the process that owns the
    // event log — the exact loss the append-only log exists to prevent.
    handle(request, response).catch((error: Error) => {
      // An aborted upload never reads this reply; a server-side failure
      // (snapshot unreadable, disk full) reaches a client that is still there.
      if (!response.headersSent) {
        respondJson(response, 500, { error: error.message });
        return;
      }
      response.destroy();
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("server neohlásil port"));
        return;
      }
      resolve({
        port: address.port,
        url: `http://localhost:${address.port}`,
        done,
        close: () =>
          new Promise<void>((resolveClose) => {
            server.close(() => resolveClose());
            server.closeAllConnections();
          }),
      });
    });
  });
}
