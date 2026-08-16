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
