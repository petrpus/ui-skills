import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { SourceFile } from "./map.ts";

/** Working data, dependencies and build output are nobody's source of truth. */
const SKIPPED_DIRS = new Set([
  "node_modules",
  ".git",
  ".ui-skills",
  "dist",
  "build",
  "coverage",
  "tmp",
  ".next",
  ".cache",
]);

const TEXT_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "json",
  "md",
  "mdx",
  "po",
  "yaml",
  "yml",
  "txt",
  "vue",
  "svelte",
  "astro",
]);

/** Anything bigger is a bundle or a fixture, not a file a human edits. */
const MAX_BYTES = 1_000_000;

function hasTextExtension(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot !== -1 && TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * Reads the editable source tree under `root` into memory, paths relative.
 *
 * `exclude` holds absolute paths that must never become mapping candidates —
 * above all the review.json being applied and the applied.md being written:
 * both quote the very text the mapper greps for, so a review sitting inside
 * the root would happily map every change onto itself.
 */
export function readSourceTree(
  root: string,
  exclude: ReadonlySet<string> = new Set(),
): SourceFile[] {
  const files: SourceFile[] = [];

  function walk(directory: string): void {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stats = statSync(path);
      if (stats.isDirectory()) {
        if (!SKIPPED_DIRS.has(name) && !name.startsWith(".")) {
          walk(path);
        }
        continue;
      }
      if (
        stats.isFile() &&
        hasTextExtension(name) &&
        stats.size <= MAX_BYTES &&
        !exclude.has(path)
      ) {
        files.push({ path: relative(root, path), content: readFileSync(path, "utf8") });
      }
    }
  }

  walk(root);
  return files;
}
