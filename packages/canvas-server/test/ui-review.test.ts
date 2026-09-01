import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/ui-review.ts";

describe("parseArgs", () => {
  it("vezme soubor a výchozí work-dir i port", () => {
    expect(parseArgs(["demo.html"])).toEqual({
      input: "demo.html",
      workDir: ".ui-skills",
      port: 0,
    });
  });

  it("přečte --work-dir a --port v libovolném pořadí", () => {
    expect(parseArgs(["--port", "8080", "demo.html", "--work-dir", "tmp/x"])).toEqual({
      input: "demo.html",
      workDir: "tmp/x",
      port: 8080,
    });
  });

  it("hodnoty flagů se nepletou se souborem", () => {
    expect(parseArgs(["--work-dir", "tmp/x", "demo.html"]).input).toBe("demo.html");
  });

  it("bez souboru selže", () => {
    expect(() => parseArgs(["--work-dir", "tmp/x"])).toThrow(/soubor/);
  });

  it("nesmyslný port selže", () => {
    expect(() => parseArgs(["demo.html", "--port", "ne"])).toThrow(/port/);
  });
});
