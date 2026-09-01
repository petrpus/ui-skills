import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.ts";

describe("parseArgs", () => {
  it("vezme cestu k review a výchozí kořen", () => {
    expect(parseArgs(["r.json"])).toEqual({ reviewPath: "r.json", root: ".", dryRun: false });
  });

  it("přečte --root a --dry-run v libovolném pořadí", () => {
    expect(parseArgs(["--root", "srv", "r.json", "--dry-run"])).toEqual({
      reviewPath: "r.json",
      root: "srv",
      dryRun: true,
    });
  });

  it("hodnota --root se neplete s cestou k review", () => {
    expect(parseArgs(["--root", "srv", "r.json"]).reviewPath).toBe("r.json");
  });

  it("bez review selže", () => {
    expect(() => parseArgs(["--dry-run"])).toThrow(/review/);
  });
});

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REVIEW_SCHEMA_VERSION, ReviewError } from "@ui-skills/schema";
import { afterEach, beforeEach } from "vitest";
import { run } from "../src/cli.ts";

function reviewDocument(schemaVersion: number = REVIEW_SCHEMA_VERSION): unknown {
  return {
    schemaVersion,
    changes: [
      {
        id: "chg_001",
        target: { cxId: "cx-1", textFingerprint: "Ahoj" },
        type: "text",
        before: "Ahoj",
        after: "Nazdar",
      },
    ],
    comments: [],
  };
}

describe("run", () => {
  let root: string;
  let reviewPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "apply-run-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.tsx"), "<h1>Ahoj</h1>\n");
    reviewPath = join(root, ".review.json");
    writeFileSync(reviewPath, JSON.stringify(reviewDocument()));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function snapshotTree(): string {
    return readdirSync(root, { recursive: true })
      .map((entry) => {
        const path = join(root, String(entry));
        return statSync(path).isFile() ? `${entry}:${readFileSync(path, "utf8")}` : String(entry);
      })
      .sort()
      .join("\n");
  }

  it("ostrý běh aplikuje editaci a zapíše applied.md vedle review", () => {
    const lines = run({ reviewPath, root, dryRun: false });
    expect(readFileSync(join(root, "src", "a.tsx"), "utf8")).toBe("<h1>Nazdar</h1>\n");
    expect(readFileSync(join(root, "applied.md"), "utf8")).toContain("applied 1 / needs-input 0");
    expect(lines.join("\n")).toContain("✓ aplikováno: applied 1");
  });

  it("dry-run nezapíše na disk vůbec nic — ani applied.md", () => {
    const before = snapshotTree();
    const lines = run({ reviewPath, root, dryRun: true });
    expect(snapshotTree()).toBe(before);
    const output = lines.join("\n");
    expect(output).toContain("dry-run (nic nezapsáno)");
    expect(output).toContain("| chg_001 |");
  });

  it("neznámou schemaVersion odmítne s vysvětlením, nic nemění", () => {
    writeFileSync(reviewPath, JSON.stringify(reviewDocument(99)));
    const before = snapshotTree();
    expect(() => run({ reviewPath, root, dryRun: false })).toThrow(ReviewError);
    expect(() => run({ reviewPath, root, dryRun: false })).toThrow(
      /nepodporovaná schemaVersion 99/,
    );
    expect(snapshotTree()).toBe(before);
  });

  it("rozbitý JSON hlásí čitelně", () => {
    writeFileSync(reviewPath, "{rozbité");
    expect(() => run({ reviewPath, root, dryRun: false })).toThrow(/nedá načíst/);
  });
});
