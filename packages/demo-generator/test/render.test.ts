import { SCHEMA_VERSION, type Tokens } from "@ui-skills/schema";
import { describe, expect, it } from "vitest";
import { renderDemo } from "../src/render.ts";

const tokens: Tokens = {
  schemaVersion: SCHEMA_VERSION,
  name: "Prorate",
  color: {
    primary: { value: "#2563eb" },
    surface: { value: "#ffffff", description: "Základní pozadí" },
  },
};

describe("renderDemo", () => {
  it("shows the name and the value of every colour token", () => {
    const html = renderDemo(tokens);

    expect(html).toContain("primary");
    expect(html).toContain("#2563eb");
    expect(html).toContain("surface");
    expect(html).toContain("#ffffff");
  });

  it("shows a token description when there is one", () => {
    expect(renderDemo(tokens)).toContain("Základní pozadí");
  });

  it("uses the system name as the page title", () => {
    expect(renderDemo(tokens)).toContain("<title>Prorate</title>");
  });

  it("falls back to a generic title when the system has no name", () => {
    const { name: _dropped, ...unnamed } = tokens;

    expect(renderDemo(unnamed)).toContain("<title>Design systém</title>");
  });

  it("emits a self-contained document with no external resource", () => {
    const html = renderDemo(tokens);

    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\(\s*["']?https?:/i);
  });

  it("carries stable section anchors", () => {
    expect(renderDemo(tokens)).toContain('data-demo-section="color"');
  });

  it("omits a section the tokens do not cover instead of rendering an empty heading", () => {
    const { color: _dropped, ...withoutColor } = tokens;
    const html = renderDemo(withoutColor);

    expect(html).not.toContain('data-demo-section="color"');
    expect(html).toContain("Zatím žádné tokeny");
  });

  it("omits the colour section when the group is present but empty", () => {
    const html = renderDemo({ ...tokens, color: {} });

    expect(html).not.toContain('data-demo-section="color"');
  });

  it("escapes token names and values so a document cannot inject markup", () => {
    const hostile = renderDemo({
      schemaVersion: SCHEMA_VERSION,
      color: { '"><img src=x>': { value: "<b>#fff</b>" } },
    });

    expect(hostile).not.toContain("<img src=x>");
    expect(hostile).not.toContain("<b>#fff</b>");
    expect(hostile).toContain("&lt;b&gt;");
  });

  it("refuses to inline a value that could escape its CSS declaration", () => {
    const hostile = renderDemo({
      schemaVersion: SCHEMA_VERSION,
      color: { evil: { value: "red; } body { display: none" } },
    });

    // The value is still listed as (escaped) text — what must not happen is it
    // reaching the style attribute, where it would close the declaration.
    expect(hostile).not.toMatch(/style="[^"]*display: none/);
    expect(hostile).toContain("<span></span>");
    expect(hostile).toContain("evil");
  });

  it("counts tokens with the right Czech plural form", () => {
    const one = renderDemo({ schemaVersion: SCHEMA_VERSION, color: { a: { value: "#000" } } });
    const three = renderDemo({
      schemaVersion: SCHEMA_VERSION,
      color: { a: { value: "#000" }, b: { value: "#111" }, c: { value: "#222" } },
    });

    expect(one).toContain("1 token<");
    expect(three).toContain("3 tokeny<");
    expect(renderDemo(tokens)).toContain("2 tokeny<");
  });

  it("is deterministic, so regenerating an unchanged system produces no diff", () => {
    expect(renderDemo(tokens)).toBe(renderDemo(tokens));
  });
});
