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

  it("keeps the order the author wrote, which a keyed object would not", () => {
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

  it("leaves out a group the document does not have", () => {
    const tokens = resolve({ schemaVersion: SCHEMA_VERSION, color: { a: { value: "#000" } } });

    expect(tokens.spacing).toBeUndefined();
  });
});
