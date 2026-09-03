import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loginWarning, looksLikeLoginPage, preflightUrl } from "../src/preflight.ts";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/ok") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html><body>ok</body></html>");
      return;
    }
    if (request.url === "/pomalu") {
      // Never answers — the timeout path.
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  base = typeof address === "object" && address !== null ? `http://127.0.0.1:${address.port}` : "";
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe("preflightUrl", () => {
  it("dostupná stránka projde", async () => {
    await expect(preflightUrl(`${base}/ok`)).resolves.toBeUndefined();
  });

  it("HTTP chyba nese status", async () => {
    await expect(preflightUrl(`${base}/chybi`)).rejects.toThrow(/HTTP 404/);
  });

  it("timeout se pojmenuje, ne visí", async () => {
    await expect(preflightUrl(`${base}/pomalu`, { timeoutMs: 300 })).rejects.toThrow(
      /neodpověděla do/,
    );
  });

  it("neexistující doména hlásí DNS, ne obecný fail", async () => {
    await expect(preflightUrl("http://neexistujici-domena.invalid/")).rejects.toThrow(/doménu/i);
  });

  it("lokální soubor se nepreflightuje", async () => {
    await expect(preflightUrl("file:///tmp/x.html")).resolves.toBeUndefined();
    await expect(preflightUrl("cesta/k/souboru.html")).resolves.toBeUndefined();
  });
});

describe("looksLikeLoginPage", () => {
  it("password input znamená login screen", () => {
    expect(looksLikeLoginPage('<form><input type="password"></form>', "https://app.example/")).toBe(
      true,
    );
    expect(looksLikeLoginPage("<h1>Dashboard</h1>", "https://app.example/")).toBe(false);
  });

  it("login-ish cesta ve zdroji stačí", () => {
    expect(looksLikeLoginPage("<h1>Vítejte</h1>", "https://app.example/login?next=/")).toBe(true);
    expect(looksLikeLoginPage("<h1>Vítejte</h1>", "https://app.example/signin")).toBe(true);
    expect(looksLikeLoginPage("<h1>Blog o loginech</h1>", "https://example.com/clanek")).toBe(
      false,
    );
  });

  it("varování odkazuje na --profile", () => {
    expect(loginWarning()).toMatch(/--profile/);
  });
});
