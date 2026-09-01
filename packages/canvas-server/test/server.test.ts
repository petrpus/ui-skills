import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateReview } from "@ui-skills/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CanvasServer, serveSession } from "../src/server.ts";

const SNAPSHOT = '<!doctype html><html><body><h1 data-cx-id="cx-1">Naše služby</h1></body></html>';

const MAP = {
  "cx-1": {
    selector: "html:nth-child(1) > body:nth-child(2) > h1:nth-child(1)",
    hostPath: [],
    textFingerprint: "Naše služby",
  },
};

let sessionDir: string;
let server: CanvasServer | undefined;

beforeEach(() => {
  sessionDir = mkdtempSync(join(tmpdir(), "canvas-server-"));
  writeFileSync(join(sessionDir, "snapshot.html"), SNAPSHOT);
  writeFileSync(join(sessionDir, "map.json"), JSON.stringify(MAP));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(sessionDir, { recursive: true, force: true });
});

async function start(): Promise<CanvasServer> {
  server = await serveSession(sessionDir);
  return server;
}

function postEvent(url: string, event: unknown): Promise<Response> {
  return fetch(`${url}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
}

describe("serveSession", () => {
  it("odmítne session bez snapshotu", async () => {
    const empty = mkdtempSync(join(tmpdir(), "canvas-empty-"));
    try {
      await expect(serveSession(empty)).rejects.toThrow(/snapshot/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("naservíruje snapshot na kořenu a hlásí volný port v URL", async () => {
    const { url, port } = await start();
    expect(port).toBeGreaterThan(0);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('<h1 data-cx-id="cx-1">Naše služby</h1>');
  });

  it("do servírované kopie injektuje overlay, soubor snapshotu nechá čistý", async () => {
    const { url } = await start();
    const served = await (await fetch(url)).text();
    expect(served).toContain('<script type="module" src="/overlay-boot.js"></script>');
    expect(served).toMatch(/overlay-boot\.js.*<\/body>/s);
    expect(readFileSync(join(sessionDir, "snapshot.html"), "utf8")).toBe(SNAPSHOT);
  });

  it("naservíruje overlay.js jako ES modul a boot, který ho spustí", async () => {
    const { url } = await start();
    const moduleResponse = await fetch(`${url}/overlay.js`);
    expect(moduleResponse.status).toBe(200);
    expect(moduleResponse.headers.get("content-type")).toContain("javascript");
    expect(await moduleResponse.text()).toContain("export function initOverlay");

    const bootResponse = await fetch(`${url}/overlay-boot.js`);
    expect(bootResponse.status).toBe(200);
    expect(await bootResponse.text()).toContain("initOverlay(window)");
  });

  it("CSP ze snapshotu přepíše tak, aby pustilo overlay a fetch na server", async () => {
    // SingleFile stamps its snapshots with `default-src 'none'; script-src
    // 'unsafe-inline' data:` — good for a file opened from disk, fatal for
    // the served copy: it blocks both /overlay.js and POST /events.
    const withCsp = SNAPSHOT.replace(
      "<body>",
      `<meta http-equiv="content-security-policy" content="default-src 'none'; script-src 'unsafe-inline' data:;"><body>`,
    );
    writeFileSync(join(sessionDir, "snapshot.html"), withCsp);

    const { url } = await start();
    const served = await (await fetch(url)).text();
    const meta = served.match(/<meta[^>]*content-security-policy[^>]*>/i)?.[0] ?? "";
    expect(meta).toContain("script-src 'self'");
    expect(meta).toContain("connect-src 'self'");
    expect(meta).not.toContain("unsafe-inline' data:");
    // The file on disk keeps its strict policy.
    expect(readFileSync(join(sessionDir, "snapshot.html"), "utf8")).toBe(withCsp);
  });

  it("neznámá cesta → 404", async () => {
    const { url } = await start();
    const response = await fetch(`${url}/neexistuje`);
    expect(response.status).toBe(404);
  });

  it("POST /events připíše řádek do events.jsonl hned, nic nedrží v paměti", async () => {
    const { url } = await start();
    const logPath = join(sessionDir, "events.jsonl");

    const first = await postEvent(url, {
      type: "text-edit",
      cxId: "cx-1",
      before: "a",
      after: "b",
    });
    expect(first.status).toBe(204);
    expect(readFileSync(logPath, "utf8").trim().split("\n")).toHaveLength(1);

    await postEvent(url, { type: "comment", cxId: "cx-1", text: "Hm." });
    const lines = readFileSync(logPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1] ?? "")).toMatchObject({ type: "comment" });
  });

  it("POST /events s neplatným JSON → 400 a do logu nic", async () => {
    const { url } = await start();
    const response = await fetch(`${url}/events`, { method: "POST", body: "{rozbité" });
    expect(response.status).toBe(400);
    expect(existsSync(join(sessionDir, "events.jsonl"))).toBe(false);
  });

  it("POST /done složí review.json + review.md z logu a server skončí", async () => {
    const { url, done } = await start();
    await postEvent(url, {
      type: "text-edit",
      cxId: "cx-1",
      before: "Naše služby",
      after: "Služby",
    });
    await postEvent(url, { type: "text-edit", cxId: "cx-1", before: "Služby", after: "Co umíme" });

    const response = await fetch(`${url}/done`, { method: "POST" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { reviewPath: string; markdownPath: string };

    const review = validateReview(JSON.parse(readFileSync(body.reviewPath, "utf8")));
    expect(review.changes).toHaveLength(1);
    expect(review.changes[0]?.before).toBe("Naše služby");
    expect(review.changes[0]?.after).toBe("Co umíme");
    expect(review.changes[0]?.target.selector).toContain("h1");

    expect(readFileSync(body.markdownPath, "utf8")).toContain("chg_001");

    await done;
    await expect(fetch(url)).rejects.toThrow();
    server = undefined;
  });

  it("POST /done bez jediné události → validní prázdné review", async () => {
    const { url } = await start();
    const response = await fetch(`${url}/done`, { method: "POST" });
    expect(response.status).toBe(200);
    const review = validateReview(
      JSON.parse(readFileSync(join(sessionDir, "review.json"), "utf8")),
    );
    expect(review.changes).toEqual([]);
    expect(review.comments).toEqual([]);
    server = undefined;
  });

  it("klient utržený uprostřed POST /events neshodí server", async () => {
    const { url, port } = await start();

    await new Promise<void>((resolve) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write(
          'POST /events HTTP/1.1\r\nHost: localhost\r\ncontent-length: 100\r\n\r\n{"type":',
          () => socket.destroy(),
        );
      });
      socket.on("close", () => resolve());
    });

    // The process that owns the log must survive one dropped connection.
    const response = await postEvent(url, { type: "comment", cxId: "cx-1", text: "Žiju." });
    expect(response.status).toBe(204);
  });

  it("chyba kompilace na /done vrátí 500, server ukončí a done rejectne", async () => {
    const { url, done } = await start();
    writeFileSync(join(sessionDir, "map.json"), "{rozbité");

    const response = await fetch(`${url}/done`, { method: "POST" });
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/map\.json/);

    await expect(done).rejects.toThrow(/review se nesložilo/);
    await expect(fetch(url)).rejects.toThrow();
    server = undefined;
  });

  it("useknutý poslední řádek logu shodí jen ten řádek, ne kompilaci", async () => {
    const { url } = await start();
    await postEvent(url, {
      type: "text-edit",
      cxId: "cx-1",
      before: "Naše služby",
      after: "Služby",
    });
    writeFileSync(join(sessionDir, "events.jsonl"), '{"type":"text-edit","cxId":"cx-1","befo', {
      flag: "a",
    });

    const response = await fetch(`${url}/done`, { method: "POST" });
    const body = (await response.json()) as { warnings: string[] };
    expect(body.warnings).toHaveLength(1);
    const review = validateReview(
      JSON.parse(readFileSync(join(sessionDir, "review.json"), "utf8")),
    );
    expect(review.changes).toHaveLength(1);
    server = undefined;
  });
});
