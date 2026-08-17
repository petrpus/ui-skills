import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capture } from "../src/capture.ts";

/**
 * The two guards the spike paid most for, tested without a browser.
 *
 * Both are plain Node logic, and both protect against a failure that looks like
 * success — which is exactly the kind that survives when only the happy path is
 * covered. A fake binary stands in for the serialiser so these run in the fast
 * suite rather than only where a browser exists.
 */

let dir: string;
let binary: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ui-skills-capture-"));
  binary = join(dir, "fake-single-file");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fakeSingleFile(script: string): string {
  writeFileSync(binary, `#!/usr/bin/env node\n${script}\n`);
  chmodSync(binary, 0o755);
  return binary;
}

describe("capture", () => {
  it("writes a snapshot and a map when the serialiser does its job", () => {
    const tool = fakeSingleFile(`
      const { writeFileSync } = require("node:fs");
      writeFileSync(process.argv[3], "<html><body><p>ahoj</p></body></html>");
    `);

    const result = capture("page.html", join(dir, "work"), { singleFileBinary: tool });

    expect(result.elements).toBeGreaterThan(0);
    expect(result.snapshotPath).toContain("snapshot.html");
  });

  it("refuses a run that wrote nothing, however cheerfully it exited", () => {
    // The real tool exits 0 and writes nothing when it will not follow a
    // redirect. Trusting the exit code alone read that as success.
    const tool = fakeSingleFile("process.exit(0);");

    expect(() => capture("page.html", join(dir, "work"), { singleFileBinary: tool })).toThrow(
      /nepořídil/,
    );
  });

  it("reports what the serialiser said when it fails outright", () => {
    const tool = fakeSingleFile('process.stderr.write("fetch failed"); process.exit(1);');

    expect(() => capture("page.html", join(dir, "work"), { singleFileBinary: tool })).toThrow(
      /fetch failed/,
    );
  });

  it("does not read back a file left over from an earlier run", () => {
    // The real tool never overwrites: it writes `snapshot (1).html` beside an
    // existing file and exits 0, so a stale snapshot would be measured as this
    // run's work. The work directory is cleared first, so a tool that writes
    // nothing cannot appear to have succeeded.
    const workDir = join(dir, "work");
    const sessionDir = join(workDir, "session-2026-01-01T00-00-00-000Z");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "snapshot.html"), "<html><body><p>starý</p></body></html>");

    const tool = fakeSingleFile("process.exit(0);");

    expect(() =>
      capture("page.html", workDir, { singleFileBinary: tool }, new Date("2026-01-01T00:00:00Z")),
    ).toThrow(/nepořídil/);
  });
});
