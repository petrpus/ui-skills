import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA_VERSION } from "@ui-skills/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs, resolveOutPath, run } from "../src/cli.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ui-skills-cli-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeTokens(contents: unknown): string {
  const path = join(dir, "tokens.json");
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

describe("parseArgs", () => {
  it("defaults to tokens.json in the working directory", () => {
    expect(parseArgs([])).toEqual({ tokensPath: "tokens.json", outPath: undefined });
  });

  it("takes the first positional argument as the tokens path", () => {
    expect(parseArgs(["design/tokens.json"]).tokensPath).toBe("design/tokens.json");
  });

  it("reads --out", () => {
    expect(parseArgs(["t.json", "--out", "public/styleguide.html"]).outPath).toBe(
      "public/styleguide.html",
    );
  });

  it("rejects --out without a path instead of swallowing the next flag", () => {
    expect(() => parseArgs(["--out", "--help"])).toThrow(/--out vyžaduje cestu/);
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["--wat"])).toThrow(/neznámý přepínač --wat/);
  });

  it("rejects a second positional argument", () => {
    expect(() => parseArgs(["a.json", "b.json"])).toThrow(/nejvýše jedna cesta/);
  });
});

describe("resolveOutPath", () => {
  it("puts the demo beside its tokens by default", () => {
    expect(resolveOutPath("/projekt/design/tokens.json", undefined)).toBe(
      "/projekt/design/demo.html",
    );
  });

  it("honours an explicit --out", () => {
    expect(resolveOutPath("/projekt/tokens.json", "/tmp/sg.html")).toBe("/tmp/sg.html");
  });
});

describe("run", () => {
  it("writes a demo next to the tokens file", () => {
    const path = writeTokens({
      schemaVersion: SCHEMA_VERSION,
      color: { primary: { value: "#2563eb" } },
    });

    const { demoPath, createdStarter } = run([path]);

    expect(demoPath).toBe(join(dir, "demo.html"));
    expect(createdStarter).toBe(false);
    expect(readFileSync(demoPath, "utf8")).toContain("#2563eb");
  });

  it("writes to --out when given one", () => {
    const path = writeTokens({ schemaVersion: SCHEMA_VERSION });
    const out = join(dir, "nested-name.html");

    expect(run([path, "--out", out]).demoPath).toBe(out);
    expect(readFileSync(out, "utf8")).toContain("<!doctype html>");
  });

  it("explains that the file is not valid JSON", () => {
    const path = join(dir, "tokens.json");
    writeFileSync(path, "{ tohle není JSON");

    expect(() => run([path])).toThrow(/není platný JSON/);
  });

  it("propagates a schema rejection rather than writing a broken demo", () => {
    const path = writeTokens({ schemaVersion: 99 });

    expect(() => run([path])).toThrow(/nepodporovaná schemaVersion 99/);
  });
});
