import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, TokensError, validateTokens } from "../src/index.ts";

const valid = {
  schemaVersion: SCHEMA_VERSION,
  name: "Prorate",
  color: {
    primary: { value: "#2563eb" },
    surface: { value: "#ffffff", description: "Základní pozadí stránky" },
  },
};

describe("validateTokens", () => {
  it("accepts a well-formed document", () => {
    const tokens = validateTokens(valid);

    expect(tokens.name).toBe("Prorate");
    expect(tokens.color?.primary?.value).toBe("#2563eb");
    expect(tokens.color?.surface?.description).toBe("Základní pozadí stránky");
  });

  it("accepts a document with no token groups at all", () => {
    expect(validateTokens({ schemaVersion: SCHEMA_VERSION })).toEqual({
      schemaVersion: SCHEMA_VERSION,
    });
  });

  it("ignores groups it does not know yet instead of rejecting them", () => {
    const tokens = validateTokens({
      ...valid,
      typography: { body: { value: "1rem" } },
    });

    expect(tokens).not.toHaveProperty("typography");
    expect(tokens.color?.primary?.value).toBe("#2563eb");
  });

  it("names the version it found when the schemaVersion is unknown", () => {
    expect(() => validateTokens({ ...valid, schemaVersion: 99 })).toThrow(
      /nepodporovaná schemaVersion 99/,
    );
  });

  it("rejects a missing schemaVersion rather than assuming the current one", () => {
    const { schemaVersion: _dropped, ...withoutVersion } = valid;

    expect(() => validateTokens(withoutVersion)).toThrow(/chybí povinné pole "schemaVersion"/);
  });

  it("rejects a non-integer schemaVersion", () => {
    expect(() => validateTokens({ ...valid, schemaVersion: "1" })).toThrow(TokensError);
  });

  it("points at the offending token when a value is missing", () => {
    const broken = { schemaVersion: SCHEMA_VERSION, color: { primary: {} } };

    expect(() => validateTokens(broken)).toThrow(/color\.primary: chybí neprázdná hodnota/);
  });

  it("rejects an empty value, which would render as an invisible swatch", () => {
    const broken = { schemaVersion: SCHEMA_VERSION, color: { primary: { value: "   " } } };

    expect(() => validateTokens(broken)).toThrow(/color\.primary/);
  });

  it("rejects an unknown key inside a token so typos surface", () => {
    const broken = { schemaVersion: SCHEMA_VERSION, color: { primary: { valeu: "#fff" } } };

    expect(() => validateTokens(broken)).toThrow(/neznámý klíč "valeu"/);
  });

  it("keeps a token named __proto__ instead of letting it vanish into the prototype", () => {
    // Built through JSON.parse on purpose: that is how tokens actually arrive,
    // and unlike an object literal it gives __proto__ as an own property.
    const raw = JSON.parse(
      `{"schemaVersion": ${SCHEMA_VERSION},
        "color": {"__proto__": {"value": "#f00"}, "primary": {"value": "#000"}}}`,
    );

    const tokens = validateTokens(raw);

    expect(Object.keys(tokens.color ?? {}).sort()).toEqual(["__proto__", "primary"]);
  });

  it("keeps token names with diacritics and other non-ASCII characters", () => {
    const tokens = validateTokens({
      schemaVersion: SCHEMA_VERSION,
      color: { "šedá-60": { value: "#999" }, "café-☂": { value: "#0f0" } },
    });

    expect(Object.keys(tokens.color ?? {}).sort()).toEqual(["café-☂", "šedá-60"]);
  });

  it("rejects a token carrying both a value and a ref", () => {
    const both = {
      schemaVersion: SCHEMA_VERSION,
      color: { a: { value: "#fff", ref: "color.b" } },
    };

    expect(() => validateTokens(both)).toThrow(/má "value" i "ref" — smí mít právě jedno/);
  });

  it("rejects a token with neither a value nor a ref", () => {
    const neither = { schemaVersion: SCHEMA_VERSION, color: { a: { css: "--a" } } };

    expect(() => validateTokens(neither)).toThrow(/chybí neprázdná hodnota "value" nebo odkaz/);
  });

  it.each([
    ["a number", 123],
    ["an unqualified name", "blue-600"],
    ["a name with two dots", "color.blue.600"],
    ["an empty group", ".blue-600"],
  ])("rejects a ref that is %s", (_label, ref) => {
    const broken = { schemaVersion: SCHEMA_VERSION, color: { a: { ref } } };

    expect(() => validateTokens(broken)).toThrow(/"ref" musí být kvalifikované jméno/);
  });

  it.each([
    ["missing the dashes", "color-primary"],
    ["a single dash", "-color-primary"],
    ["not a string", 42],
    ["containing a space", "--color primary"],
  ])("rejects a css mapping that is %s", (_label, css) => {
    const broken = { schemaVersion: SCHEMA_VERSION, color: { a: { value: "#fff", css } } };

    expect(() => validateTokens(broken)).toThrow(/"css" musí být CSS custom property/);
  });

  it("accepts a well-formed css mapping", () => {
    const tokens = validateTokens({
      schemaVersion: SCHEMA_VERSION,
      color: { a: { value: "#fff", css: "--color-surface_2" } },
    });

    expect(tokens.color?.a?.css).toBe("--color-surface_2");
  });

  it("rejects a token name with a dot, which no ref could ever address", () => {
    const dotted = { schemaVersion: SCHEMA_VERSION, color: { "gray.100": { value: "#eee" } } };

    expect(() => validateTokens(dotted)).toThrow(/jméno tokenu nesmí obsahovat tečku/);
  });

  it("rejects a token that is not an object", () => {
    const broken = { schemaVersion: SCHEMA_VERSION, color: { primary: "#fff" } };

    expect(() => validateTokens(broken)).toThrow(/color\.primary: token musí být objekt/);
  });

  it("rejects a non-object document", () => {
    expect(() => validateTokens([])).toThrow(/musí obsahovat objekt/);
    expect(() => validateTokens(null)).toThrow(TokensError);
  });

  it("does not carry unexpected top-level keys into the result", () => {
    const tokens = validateTokens({ ...valid, somethingElse: { nested: true } });

    expect(Object.keys(tokens).sort()).toEqual(["color", "name", "schemaVersion"]);
  });
});
