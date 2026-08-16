import { describe, expect, it } from "vitest";
import { resolveTokens, SCHEMA_VERSION, TokensError, validateTokens } from "../src/index.ts";

function resolve(document: unknown) {
  return resolveTokens(validateTokens(document));
}

describe("resolveTokens", () => {
  it("resolves a reference to the primitive it points at", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: { "blue-600": { value: "#2563eb" }, primary: { ref: "color.blue-600" } },
    });

    expect(tokens.color?.[1]?.value).toBe("#2563eb");
  });

  it("follows a chain of references all the way to the literal", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: {
        "blue-600": { value: "#2563eb" },
        brand: { ref: "color.blue-600" },
        primary: { ref: "color.brand" },
      },
    });
    const primary = tokens.color?.find((token) => token.name === "primary");

    expect(primary?.value).toBe("#2563eb");
    expect(primary?.chain).toEqual(["color.primary", "color.brand", "color.blue-600"]);
  });

  it("gives a primitive a chain of just itself", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: { "blue-600": { value: "#2563eb" } },
    });

    expect(tokens.color?.[0]?.chain).toEqual(["color.blue-600"]);
  });

  it("reports a cycle with the path that closes it", () => {
    const cyclic = {
      schemaVersion: SCHEMA_VERSION,
      color: { primary: { ref: "color.brand" }, brand: { ref: "color.primary" } },
    };

    expect(() => resolve(cyclic)).toThrow(
      /cyklický odkaz: color\.primary → color\.brand → color\.primary/,
    );
  });

  it("reports a token that points at itself", () => {
    const selfish = { schemaVersion: SCHEMA_VERSION, color: { a: { ref: "color.a" } } };

    expect(() => resolve(selfish)).toThrow(/cyklický odkaz: color\.a → color\.a/);
  });

  it("terminates on a cycle rather than following it forever", () => {
    const long = {
      schemaVersion: SCHEMA_VERSION,
      color: {
        a: { ref: "color.b" },
        b: { ref: "color.c" },
        c: { ref: "color.d" },
        d: { ref: "color.b" },
      },
    };

    expect(() => resolve(long)).toThrow(TokensError);
  });

  it("names the token a dangling reference points at", () => {
    const dangling = {
      schemaVersion: SCHEMA_VERSION,
      color: { primary: { ref: "color.nikde" } },
    };

    expect(() => resolve(dangling)).toThrow(/odkaz na neexistující token "color\.nikde"/);
  });

  it("names the referring token, not just the missing one", () => {
    try {
      resolve({ schemaVersion: SCHEMA_VERSION, color: { primary: { ref: "color.nikde" } } });
      expect.unreachable("dangling reference should throw");
    } catch (error) {
      expect((error as TokensError).path).toBe("color.primary");
    }
  });

  it("resolves a reference across groups", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      spacing: { base: { value: "8px" } },
      radius: { card: { ref: "spacing.base" } },
    });

    expect(tokens.radius?.[0]?.value).toBe("8px");
  });

  it("carries css and description through a reference without inheriting them", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: {
        "blue-600": { value: "#2563eb", description: "Primitivum" },
        primary: { ref: "color.blue-600", css: "--color-primary" },
      },
    });
    const primary = tokens.color?.find((token) => token.name === "primary");

    expect(primary?.css).toBe("--color-primary");
    expect(primary?.description).toBeUndefined();
  });

  it("keeps the order the document had", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: {
        zinc: { value: "#71717a" },
        amber: { value: "#f59e0b" },
        blue: { value: "#2563eb" },
      },
    });

    expect(tokens.color?.map((token) => token.name)).toEqual(["zinc", "amber", "blue"]);
  });

  it("orders integer-like names numerically, which JSON.parse decided before us", () => {
    // Documents a limitation rather than a feature: the author wrote 100 first,
    // but object keys that look like integers are already reordered by the time
    // the document reaches us. For a palette the numeric order is the wanted
    // one, so this is recorded rather than worked around.
    const raw = JSON.parse(
      `{"schemaVersion": ${SCHEMA_VERSION},
        "spacing": {"100": {"value": "8px"}, "50": {"value": "4px"}}}`,
    );

    expect(resolveTokens(validateTokens(raw)).spacing?.map((token) => token.name)).toEqual([
      "50",
      "100",
    ]);
  });

  it("gives each token its own chain when several share a tail", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: {
        base: { value: "#2563eb" },
        mid: { ref: "color.base" },
        left: { ref: "color.mid" },
        right: { ref: "color.mid" },
      },
    });
    const chainOf = (name: string) => tokens.color?.find((token) => token.name === name)?.chain;

    expect(chainOf("left")).toEqual(["color.left", "color.mid", "color.base"]);
    expect(chainOf("right")).toEqual(["color.right", "color.mid", "color.base"]);
    expect(chainOf("mid")).toEqual(["color.mid", "color.base"]);
    expect(chainOf("base")).toEqual(["color.base"]);
  });

  // No timing assertion guards the memoisation in `follow`, deliberately.
  // Both versions materialise one chain per token, so they differ by a constant
  // factor rather than a growth rate — a ratio test cannot separate them, and a
  // fixed ceiling turned out to sit inside the measurement noise: at the length
  // where the unmemoised version reliably fails (~4.8s), the memoised one
  // ranged from 1.0s to 2.4s depending on what else the suite had just run.
  // A guard that flaky is worse than none, and the shape it protects — a long
  // chain rather than many tokens onto one primitive — is not one a real design
  // system has. These two check that both shapes come out correct.

  it("resolves a long chain to the literal at its end", () => {
    const length = 2000;
    const color: Record<string, unknown> = { "t-0": { value: "#2563eb" } };
    for (let i = 1; i < length; i += 1) {
      color[`t-${i}`] = { ref: `color.t-${i - 1}` };
    }

    const tokens = resolve({ schemaVersion: SCHEMA_VERSION, color });

    expect(tokens.color?.at(-1)?.value).toBe("#2563eb");
    expect(tokens.color?.at(-1)?.chain).toHaveLength(length);
    expect(tokens.color?.at(-1)?.chain.at(-1)).toBe("color.t-0");
  });

  it("resolves the shape that actually occurs: many tokens onto one primitive", () => {
    const width = 5000;
    const color: Record<string, unknown> = { base: { value: "#2563eb" } };
    for (let i = 0; i < width; i += 1) {
      color[`semantic-${i}`] = { ref: "color.base" };
    }

    const tokens = resolve({ schemaVersion: SCHEMA_VERSION, color });

    expect(tokens.color).toHaveLength(width + 1);
    expect(tokens.color?.at(-1)?.chain).toEqual([`color.semantic-${width - 1}`, "color.base"]);
  });

  it("leaves out a group the document does not have", () => {
    const tokens = resolve({ schemaVersion: SCHEMA_VERSION, color: { a: { value: "#000" } } });

    expect(tokens.spacing).toBeUndefined();
  });
});

describe("roles and contrast pairs as reference entry points", () => {
  it("resolves a role through a chain of references", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: { base: { value: "#000" }, mid: { ref: "color.base" }, ink: { ref: "color.mid" } },
      roles: { text: "color.ink" },
    });

    expect(tokens.roles?.text?.value).toBe("#000");
    expect(tokens.roles?.text?.chain).toEqual(["color.ink", "color.mid", "color.base"]);
  });

  it("blames the role, not the token, when a role points nowhere", () => {
    try {
      resolve({
        schemaVersion: SCHEMA_VERSION,
        color: { ink: { value: "#000" } },
        roles: { text: "color.nikde" },
      });
      expect.unreachable("dangling role should throw");
    } catch (error) {
      expect((error as TokensError).path).toBe("roles.text");
      expect((error as Error).message).toContain("color.nikde");
    }
  });

  it("still detects a cycle reached through a role", () => {
    const cyclic = {
      schemaVersion: SCHEMA_VERSION,
      color: { a: { ref: "color.b" }, b: { ref: "color.a" } },
      roles: { text: "color.a" },
    };

    expect(() => resolve(cyclic)).toThrow(/cyklický odkaz/);
  });

  it("blames the position of a contrast pair that points nowhere", () => {
    try {
      resolve({
        schemaVersion: SCHEMA_VERSION,
        color: { ink: { value: "#000" } },
        contrastPairs: [
          { fg: "color.ink", bg: "color.ink" },
          { fg: "color.ink", bg: "color.nikde" },
        ],
      });
      expect.unreachable("dangling contrast pair should throw");
    } catch (error) {
      expect((error as TokensError).path).toBe("contrastPairs[1].bg");
    }
  });
});

describe("dark mode", () => {
  it("gives a token its override in dark and its own value in light", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: { ink: { value: "#18181b", dark: { value: "#fafafa" } } },
    });

    expect(tokens.color?.[0]?.value).toBe("#18181b");
    expect(tokens.color?.[0]?.dark).toBe("#fafafa");
  });

  it("leaves dark unset when the token looks the same in both modes", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: { brand: { value: "#2563eb" } },
    });

    expect(tokens.color?.[0]?.dark).toBeUndefined();
  });

  it("redirects a reference rather than restating a value", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: {
        "gray-100": { value: "#f4f4f5" },
        "gray-900": { value: "#18181b" },
        "surface-2": { ref: "color.gray-100", dark: { ref: "color.gray-900" } },
      },
    });
    const surface = tokens.color?.find((token) => token.name === "surface-2");

    expect(surface?.value).toBe("#f4f4f5");
    expect(surface?.dark).toBe("#18181b");
  });

  it("carries an override through a token that points at it", () => {
    // The point of a palette swap: one token darkens and everything leaning on
    // it follows, without each needing an override of its own.
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: {
        ink: { value: "#18181b", dark: { value: "#fafafa" } },
        heading: { ref: "color.ink" },
      },
    });
    const heading = tokens.color?.find((token) => token.name === "heading");

    expect(heading?.value).toBe("#18181b");
    expect(heading?.dark).toBe("#fafafa");
  });

  it("follows a chain of overrides to the end", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: {
        base: { value: "#000", dark: { value: "#fff" } },
        mid: { ref: "color.base" },
        top: { ref: "color.mid" },
      },
    });

    expect(tokens.color?.find((token) => token.name === "top")?.dark).toBe("#fff");
  });

  it("detects a cycle that exists only in dark mode", () => {
    const cyclic = {
      schemaVersion: SCHEMA_VERSION,
      color: {
        a: { value: "#000", dark: { ref: "color.b" } },
        b: { value: "#111", dark: { ref: "color.a" } },
      },
    };

    expect(() => resolve(cyclic)).toThrow(/cyklický odkaz/);
  });

  it("reports a dark override pointing at a token that is not there", () => {
    const dangling = {
      schemaVersion: SCHEMA_VERSION,
      color: { a: { value: "#000", dark: { ref: "color.nikde" } } },
    };

    expect(() => resolve(dangling)).toThrow(/odkaz na neexistující token "color\.nikde"/);
  });

  it("resolves a role to both of its faces", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      color: { ink: { value: "#18181b", dark: { value: "#fafafa" } } },
      roles: { text: "color.ink" },
    });

    expect(tokens.roles?.text?.value).toBe("#18181b");
    expect(tokens.roles?.text?.dark).toBe("#fafafa");
  });

  it("darkens a spacing token if someone really wants to", () => {
    const tokens = resolve({
      schemaVersion: SCHEMA_VERSION,
      spacing: { gap: { value: "16px", dark: { value: "20px" } } },
    });

    expect(tokens.spacing?.[0]?.dark).toBe("20px");
  });
});
