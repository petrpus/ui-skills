import { describe, expect, it } from "vitest";
import { isTranslationPath, mapTarget, type SourceFile } from "../src/map.ts";

const component: SourceFile = {
  path: "src/components/Services.tsx",
  content: `export function Services() {\n  return <h2>Naše služby</h2>;\n}\n`,
};

const translation: SourceFile = {
  path: "locales/cs.json",
  content: `{\n  "services.title": "Naše služby"\n}\n`,
};

const other: SourceFile = {
  path: "src/pages/home.tsx",
  content: `<p>Úplně jiný text</p>\n`,
};

function target(extra: Record<string, unknown> = {}) {
  return { cxId: "cx-1", textFingerprint: "Naše služby", ...extra };
}

describe("isTranslationPath", () => {
  it("pozná překladové soubory podle cesty i jména", () => {
    expect(isTranslationPath("locales/cs.json")).toBe(true);
    expect(isTranslationPath("src/i18n/messages.ts")).toBe(true);
    expect(isTranslationPath("translations/common.po")).toBe(true);
    expect(isTranslationPath("src/components/Services.tsx")).toBe(false);
    expect(isTranslationPath("package.json")).toBe(false);
  });
});

describe("mapTarget", () => {
  it("jediný textový nález → jednoznačný kandidát se souborem a řádkem", () => {
    const mapping = mapTarget(target(), "Naše služby", [component, other]);
    expect(mapping.candidates).toHaveLength(1);
    expect(mapping.candidates[0]).toMatchObject({
      path: "src/components/Services.tsx",
      line: 2,
      via: "text",
      translation: false,
    });
  });

  it("sourceHint má přednost před textovým otiskem", () => {
    const hinted = mapTarget(target({ sourceHint: "src/pages/home.tsx:1" }), "Úplně jiný text", [
      component,
      other,
    ]);
    expect(hinted.candidates[0]).toMatchObject({ path: "src/pages/home.tsx", via: "sourceHint" });
  });

  it("sourceHint na neexistující soubor spadne na textový otisk", () => {
    const mapping = mapTarget(target({ sourceHint: "src/smazano.tsx:5" }), "Naše služby", [
      component,
      other,
    ]);
    expect(mapping.candidates[0]).toMatchObject({
      path: "src/components/Services.tsx",
      via: "text",
    });
  });

  it("text ve dvou souborech → nejednoznačné, s vysvětlením", () => {
    const mapping = mapTarget(target(), "Naše služby", [component, translation]);
    expect(mapping.candidates).toHaveLength(2);
    expect(mapping.reason).toMatch(/2 soubor/);
  });

  it("nález v komponentě i překladu vysvětlí i18n riziko", () => {
    const mapping = mapTarget(target(), "Naše služby", [component, translation]);
    expect(mapping.reason).toMatch(/překlad/i);
  });

  it("nález jen v překladovém souboru je označený jako překlad", () => {
    const mapping = mapTarget(target(), "Naše služby", [translation, other]);
    expect(mapping.candidates).toHaveLength(1);
    expect(mapping.candidates[0]?.translation).toBe(true);
  });

  it("dva výskyty v jednom souboru jsou dva kandidáti — nehádá se, který přepsat", () => {
    const twice: SourceFile = {
      path: "src/a.tsx",
      content: "<h2>Naše služby</h2>\n<footer>Naše služby</footer>\n",
    };
    const mapping = mapTarget(target(), "Naše služby", [twice]);
    expect(mapping.candidates).toHaveLength(2);
  });

  it("nic nenalezeno → prázdní kandidáti s vysvětlením", () => {
    const mapping = mapTarget(target(), "Neexistující věta", [component, other]);
    expect(mapping.candidates).toEqual([]);
    expect(mapping.reason).toMatch(/nebyl.*nalezen/);
  });

  it("selektor s #id najde soubor přes id, když text selže", () => {
    const withId: SourceFile = {
      path: "src/hero.tsx",
      content: `<section id="hero-main">\n  <h1>{title}</h1>\n</section>\n`,
    };
    const mapping = mapTarget(
      target({ selector: "section#hero-main > h1:nth-child(1)", textFingerprint: "" }),
      "",
      [withId, other],
    );
    expect(mapping.candidates[0]).toMatchObject({ path: "src/hero.tsx", via: "selector" });
  });
});

describe("isTranslationPath — nálezy z review", () => {
  it("nechytá běžné konfigurační a zdrojové soubory", () => {
    expect(isTranslationPath("ci.yml")).toBe(false);
    expect(isTranslationPath("db.json")).toBe(false);
    expect(isTranslationPath("src/messagesSlice.ts")).toBe(false);
    expect(isTranslationPath("src/messages.ts")).toBe(false);
  });

  it("chytá lokalizační soubory s regionem a gettext katalogy kdekoli", () => {
    expect(isTranslationPath("cs-CZ.json")).toBe(true);
    expect(isTranslationPath("src/common.po")).toBe(true);
    expect(isTranslationPath("messages.json")).toBe(true);
  });
});
