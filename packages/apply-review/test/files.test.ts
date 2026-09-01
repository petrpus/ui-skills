import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSourceTree } from "../src/files.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "apply-files-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "node_modules", "x"), { recursive: true });
  mkdirSync(join(root, ".ui-skills", "session-1"), { recursive: true });
  writeFileSync(join(root, "src", "a.tsx"), "<h1>Ahoj</h1>\n");
  writeFileSync(join(root, "node_modules", "x", "b.js"), "ignorováno\n");
  writeFileSync(join(root, ".ui-skills", "session-1", "review.json"), "{}\n");
  writeFileSync(join(root, "obrazek.png"), "binarni\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("readSourceTree", () => {
  it("čte jen editovatelné zdroje, přeskakuje závislosti, pracovní data a binárky", () => {
    const files = readSourceTree(root);
    expect(files.map((file) => file.path)).toEqual([join("src", "a.tsx")]);
  });

  it("vyloučí zadané soubory — review.json v kořeni nesmí mapovat sám sebe", () => {
    const reviewPath = join(root, "review.json");
    writeFileSync(reviewPath, '{ "before": "Ahoj" }\n');

    const withReview = readSourceTree(root);
    expect(withReview.map((file) => file.path)).toContain("review.json");

    const excluded = readSourceTree(root, new Set([reviewPath]));
    expect(excluded.map((file) => file.path)).toEqual([join("src", "a.tsx")]);
  });
});
