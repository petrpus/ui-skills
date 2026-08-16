import { resolveTokens, SCHEMA_VERSION, validateTokens } from "@ui-skills/schema";
import { describe, expect, it } from "vitest";
import { reportContrast } from "../src/contrast.ts";

function report(document: unknown) {
  return reportContrast(resolveTokens(validateTokens(document)));
}

const palette = {
  ink: { value: "#18181b" },
  "ink-60": { value: "#71717a" },
  paper: { value: "#ffffff" },
  canvas: { value: "#f4f4f5" },
  brand: { value: "#2563eb" },
};

describe("reportContrast levels", () => {
  it("uses roles when they are given, whatever the tokens are called", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: palette,
      roles: {
        text: "color.ink",
        "text-muted": "color.ink-60",
        surface: "color.paper",
        "surface-2": "color.canvas",
      },
    });

    expect(result?.source).toBe("roles");
    expect(result?.checks).toHaveLength(4);
    expect(result?.checks.map((entry) => `${entry.fg.name}/${entry.bg.name}`)).toContain(
      "ink/paper",
    );
  });

  it("pairs each on-x role with its x", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: { ...palette, "on-brand": { value: "#ffffff" } },
      roles: { primary: "color.brand", "on-primary": "color.on-brand" },
    });

    expect(result?.source).toBe("roles");
    expect(result?.checks).toHaveLength(1);
    expect(result?.checks[0]?.fg.name).toBe("on-brand");
    expect(result?.checks[0]?.bg.name).toBe("brand");
  });

  it("falls back to naming convention when roles are absent", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: {
        "text-primary": { value: "#18181b" },
        "text-muted": { value: "#71717a" },
        surface: { value: "#ffffff" },
      },
    });

    expect(result?.source).toBe("convention");
    expect(result?.checks).toHaveLength(2);
  });

  it("falls back to black and white when neither roles nor convention apply", () => {
    const result = report({ schemaVersion: SCHEMA_VERSION, color: palette });

    expect(result?.source).toBe("fallback");
    expect(result?.checks).toHaveLength(Object.keys(palette).length * 2);
  });

  it("prefers roles over convention when both could apply", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: { "text-main": { value: "#000" }, surface: { value: "#fff" } },
      roles: { text: "color.text-main", surface: "color.surface" },
    });

    expect(result?.source).toBe("roles");
    expect(result?.checks).toHaveLength(1);
  });

  it("does not claim the roles level when the role map has no usable pair", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: palette,
      roles: { border: "color.canvas" },
    });

    expect(result?.source).toBe("fallback");
  });

  it("reports nothing at all when there are no colours", () => {
    expect(report({ schemaVersion: SCHEMA_VERSION })).toBeUndefined();
  });
});

describe("declared contrast pairs", () => {
  const document = {
    schemaVersion: SCHEMA_VERSION,
    color: palette,
    roles: { text: "color.ink", surface: "color.paper" },
    contrastPairs: [{ fg: "color.ink-60", bg: "color.brand" }],
  };

  it("adds a declared pair to what the level produced", () => {
    const result = report(document);

    expect(result?.source).toBe("roles");
    expect(result?.checks).toHaveLength(2);
    expect(result?.checks.at(-1)?.bg.name).toBe("brand");
  });

  it("does not duplicate a pair the level already covers", () => {
    const result = report({
      ...document,
      contrastPairs: [{ fg: "color.ink", bg: "color.paper" }],
    });

    expect(result?.checks).toHaveLength(1);
  });

  it("works with no colours of its own to stand on", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: palette,
      contrastPairs: [{ fg: "color.ink", bg: "color.brand" }],
    });

    expect(result?.checks.some((entry) => entry.bg.name === "brand")).toBe(true);
  });
});

describe("contrast values", () => {
  it("computes the ratio and grade for a readable pair", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: { ink: { value: "#000000" }, paper: { value: "#ffffff" } },
      roles: { text: "color.ink", surface: "color.paper" },
    });

    expect(result?.checks[0]?.ratio).toBeCloseTo(21, 2);
    expect(result?.checks[0]?.grade).toBe("AAA");
  });

  it("grades an unreadable pair as failing rather than hiding it", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: { a: { value: "#f4f4f5" }, b: { value: "#ffffff" } },
      roles: { text: "color.a", surface: "color.b" },
    });

    expect(result?.checks[0]?.grade).toBe("fail");
  });

  it("says nothing rather than guessing when a value is not a readable colour", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: { a: { value: "var(--from-elsewhere)" }, b: { value: "#ffffff" } },
      roles: { text: "color.a", surface: "color.b" },
    });

    expect(result?.checks[0]?.ratio).toBeUndefined();
    expect(result?.checks[0]?.grade).toBeUndefined();
  });

  it("resolves a role that points at a reference", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: { base: { value: "#000000" }, ink: { ref: "color.base" }, paper: { value: "#fff" } },
      roles: { text: "color.ink", surface: "color.paper" },
    });

    expect(result?.checks[0]?.ratio).toBeCloseTo(21, 2);
  });
});

describe("translucent colours", () => {
  it("reports what a reader actually sees, not the colour before painting", () => {
    // Half-transparent black on white looks mid grey at about 4:1 — reporting
    // the 21:1 of solid black would tell a designer an unreadable pair is safe.
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: { scrim: { value: "rgba(0, 0, 0, 0.5)" }, paper: { value: "#ffffff" } },
      roles: { text: "color.scrim", surface: "color.paper" },
    });

    expect(result?.checks[0]?.ratio).toBeCloseTo(4.0, 0);
    expect(result?.checks[0]?.grade).not.toBe("AAA");
  });

  it("handles a hex value carrying alpha the same way", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: { faded: { value: "#00000080" }, paper: { value: "#ffffff" } },
      roles: { text: "color.faded", surface: "color.paper" },
    });

    expect(result?.checks[0]?.ratio).toBeLessThan(21);
  });

  it("says unknown when the backdrop itself is translucent", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: { ink: { value: "#000" }, veil: { value: "rgba(255, 255, 255, 0.4)" } },
      roles: { text: "color.ink", surface: "color.veil" },
    });

    expect(result?.checks[0]?.ratio).toBeUndefined();
    expect(result?.checks[0]?.grade).toBeUndefined();
  });
});

describe("declared pairs keyed on identity", () => {
  it("keeps a declared pair whose colour happens to match another token", () => {
    const result = report({
      schemaVersion: SCHEMA_VERSION,
      color: {
        ink: { value: "#111111" },
        rule: { value: "#111111" },
        paper: { value: "#ffffff" },
      },
      roles: { text: "color.ink", surface: "color.paper" },
      contrastPairs: [{ fg: "color.rule", bg: "color.paper" }],
    });

    expect(result?.checks).toHaveLength(2);
    expect(result?.checks.map((entry) => entry.fg.name)).toEqual(["ink", "rule"]);
  });
});
