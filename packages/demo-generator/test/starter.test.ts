import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTokens, SCHEMA_VERSION, validateTokens } from "@ui-skills/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.ts";
import { serializeStarter, starterTokens } from "../src/starter.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ui-skills-starter-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the starter document", () => {
  it("passes the validation this tool applies to any other document", () => {
    // The one property that must never break: a tool that writes a file it
    // would itself reject is worse than one that writes nothing.
    expect(() => validateTokens(starterTokens())).not.toThrow();
  });

  it("resolves without a dangling reference or a cycle", () => {
    expect(() => resolveTokens(validateTokens(starterTokens()))).not.toThrow();
  });

  it("carries the current schema version", () => {
    expect(starterTokens().schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("shows every section the demo can render, so the shape is learnable from it", () => {
    const tokens = starterTokens();

    for (const section of ["color", "roles", "typography", "spacing", "radius", "shadow"]) {
      expect(tokens).toHaveProperty(section);
    }
  });

  it("demonstrates a reference rather than only literal values", () => {
    const color = starterTokens().color as Record<string, Record<string, unknown>>;

    expect(color.ink?.ref).toBe("color.zinc-900");
  });

  it("explains itself in the file, since JSON cannot carry comments", () => {
    const readme = starterTokens()._readme;

    expect(Array.isArray(readme)).toBe(true);
    expect((readme as string[]).join(" ")).toMatch(/přepiš/i);
  });

  it("keeps the explanation out of the validated result", () => {
    expect(validateTokens(starterTokens())).not.toHaveProperty("_readme");
  });

  it("serializes as indented JSON that parses back", () => {
    const text = serializeStarter();

    expect(text.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).toContain('\n  "schemaVersion"');
  });

  it("declares roles, so the demo checks contrast from meaning not guesswork", () => {
    const roles = starterTokens().roles as Record<string, string>;

    expect(roles.text).toBe("color.ink");
    expect(roles.surface).toBe("color.paper");
  });
});

describe("first run in a project", () => {
  it("writes the starter and a demo instead of failing", () => {
    const tokensPath = join(dir, "tokens.json");

    const result = run([tokensPath]);

    expect(result.createdStarter).toBe(true);
    expect(existsSync(tokensPath)).toBe(true);
    expect(readFileSync(result.demoPath, "utf8")).toContain("Můj design systém");
  });

  it("writes a starter the next run reads back without changing anything", () => {
    const tokensPath = join(dir, "tokens.json");

    run([tokensPath]);
    const before = readFileSync(tokensPath, "utf8");
    const second = run([tokensPath]);

    expect(second.createdStarter).toBe(false);
    expect(readFileSync(tokensPath, "utf8")).toBe(before);
  });

  it("never overwrites a tokens.json that already exists", () => {
    const tokensPath = join(dir, "tokens.json");
    const mine = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      color: { mine: { value: "#abcdef" } },
    });
    writeFileSync(tokensPath, mine);

    const result = run([tokensPath]);

    expect(result.createdStarter).toBe(false);
    expect(readFileSync(tokensPath, "utf8")).toBe(mine);
    expect(readFileSync(result.demoPath, "utf8")).toContain("#abcdef");
  });

  it("leaves an empty tokens.json alone rather than treating it as absent", () => {
    const tokensPath = join(dir, "tokens.json");
    writeFileSync(tokensPath, "");

    expect(() => run([tokensPath])).toThrow(/není platný JSON/);
    expect(readFileSync(tokensPath, "utf8")).toBe("");
  });

  it("reports a directory in place of the file rather than trying to write over it", () => {
    const tokensPath = join(dir, "tokens.json");
    rmSync(tokensPath, { force: true });
    mkdtempSync(join(dir, "x-"));
    writeFileSync(join(dir, "occupied.json"), "");

    expect(() => run([dir])).toThrow();
  });
});
