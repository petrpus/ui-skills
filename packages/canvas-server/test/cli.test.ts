import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.ts";

describe("parseArgs", () => {
  it("vezme session adresář a výchozí volný port", () => {
    expect(parseArgs([".ui-skills/session-x"])).toEqual({
      sessionDir: ".ui-skills/session-x",
      port: 0,
    });
  });

  it("přečte --port", () => {
    expect(parseArgs(["dir", "--port", "8080"])).toEqual({ sessionDir: "dir", port: 8080 });
  });

  it("hodnota --port se neplete se session adresářem, ať je pořadí jakékoli", () => {
    expect(parseArgs(["--port", "8080", "dir"])).toEqual({ sessionDir: "dir", port: 8080 });
  });

  it("bez session adresáře selže", () => {
    expect(() => parseArgs([])).toThrow(/session/);
  });

  it("nesmyslný port selže", () => {
    expect(() => parseArgs(["dir", "--port", "osmdesát"])).toThrow(/port/);
  });
});
