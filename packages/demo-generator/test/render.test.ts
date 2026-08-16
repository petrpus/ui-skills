import { resolveTokens, SCHEMA_VERSION, validateTokens } from "@ui-skills/schema";
import { describe, expect, it } from "vitest";
import { renderDemo } from "../src/render.ts";

/** Goes through the real validate → resolve path, so the tests can't drift from it. */
function render(document: unknown): string {
  return renderDemo(resolveTokens(validateTokens(document)));
}

const doc = {
  schemaVersion: SCHEMA_VERSION,
  name: "Prorate",
  color: {
    primary: { value: "#2563eb" },
    surface: { value: "#ffffff", description: "Základní pozadí" },
  },
};

describe("renderDemo", () => {
  it("shows the name and the value of every colour token", () => {
    const html = render(doc);

    expect(html).toContain("primary");
    expect(html).toContain("#2563eb");
    expect(html).toContain("surface");
    expect(html).toContain("#ffffff");
  });

  it("shows a token description when there is one", () => {
    expect(render(doc)).toContain("Základní pozadí");
  });

  it("uses the system name as the page title", () => {
    expect(render(doc)).toContain("<title>Prorate</title>");
  });

  it("falls back to a generic title when the system has no name", () => {
    const { name: _dropped, ...unnamed } = doc;

    expect(render(unnamed)).toContain("<title>Design systém</title>");
  });

  it("emits a self-contained document with no external resource", () => {
    const html = render(doc);

    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\(\s*["']?https?:/i);
  });

  it("carries stable section anchors", () => {
    expect(render(doc)).toContain('data-demo-section="color"');
  });

  it("omits a section the tokens do not cover instead of rendering an empty heading", () => {
    const { color: _dropped, ...withoutColor } = doc;
    const html = render(withoutColor);

    expect(html).not.toContain('data-demo-section="color"');
    expect(html).toContain("Zatím žádné tokeny");
  });

  it("omits the colour section when the group is present but empty", () => {
    expect(render({ ...doc, color: {} })).not.toContain('data-demo-section="color"');
  });

  it("escapes token names and values so a document cannot inject markup", () => {
    const hostile = render({
      schemaVersion: SCHEMA_VERSION,
      color: { '"><img src=x>': { value: "<b>#fff</b>" } },
    });

    expect(hostile).not.toContain("<img src=x>");
    expect(hostile).not.toContain("<b>#fff</b>");
    expect(hostile).toContain("&lt;b&gt;");
  });

  it("refuses to inline a value that could escape its CSS declaration", () => {
    const hostile = render({
      schemaVersion: SCHEMA_VERSION,
      color: { evil: { value: "red; } body { display: none" } },
    });

    // The value is still listed as (escaped) text — what must not happen is it
    // reaching the style attribute, where it would close the declaration.
    expect(hostile).not.toMatch(/style="[^"]*display: none/);
    expect(hostile).toContain("<span></span>");
    expect(hostile).toContain("evil");
  });

  it.each([
    ["absolute url", "url(https://evil.example.com/track.png)"],
    ["protocol-relative url", "url(//evil.example.com/track.png)"],
    ["quoted url", 'url("https://evil.example.com/track.png")'],
    ["spaced url", "url  (https://evil.example.com/track.png)"],
    ["uppercase url", "URL(https://evil.example.com/track.png)"],
    ["data uri", "url(data:image/gif;base64,R0lGOD)"],
    ["image-set", 'image-set("https://evil.example.com/track.png" 1x)'],
    ["-webkit-image-set", '-webkit-image-set("https://evil.example.com/track.png" 1x)'],
    ["cross-fade", 'cross-fade("https://evil.example.com/track.png")'],
    ["css-escaped url", "\\75 rl(https://evil.example.com/track.png)"],
    ["unknown function", "totally-new-fetcher(https://evil.example.com/track.png)"],
    ["fullwidth parens", "url（//evil.example.com/track.png）"],
    ["css comment", "red /* } body { display:none */"],
  ])("keeps %s out of the stylesheet, so the file still opens offline", (_label, value) => {
    const html = render({ schemaVersion: SCHEMA_VERSION, color: { sneaky: { value } } });

    expect(html).not.toMatch(/style="[^"]*evil\.example\.com/i);
    expect(html).not.toMatch(/style="[^"]*(?:url|image-set|cross-fade)/i);
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:/i);
    expect(html).toContain("sneaky");
  });

  it.each([
    ["hex", "#2563eb"],
    ["hex with alpha", "#2563ebcc"],
    ["named colour", "rebeccapurple"],
    ["keyword", "currentColor"],
    ["rgb", "rgb(37 99 235 / 0.5)"],
    ["hsl", "hsl(210deg 90% 55%)"],
    ["oklch", "oklch(0.65 0.2 255)"],
    ["custom property", "var(--color-primary)"],
    ["colour mix", "color-mix(in oklch, red 50%, blue)"],
    ["calc", "calc(100% - 2rem)"],
    ["custom property with underscore", "var(--brand_primary)"],
    // Forms #11 will render with this same guard — spacing, radii and shadows
    // must not be rejected by a rule written with colours in mind.
    ["length", "8px"],
    ["negative length", "-0.5rem"],
    ["percentage", "50%"],
    ["clamped length", "clamp(0.5rem, 1vw, 1rem)"],
    ["shadow", "0 1px 2px rgba(0,0,0,.08)"],
    ["inset shadow", "inset 0 1px 2px rgba(0,0,0,.2)"],
    ["multi shadow", "0 1px 2px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.12)"],
  ])("still paints a swatch for a legitimate %s value", (_label, value) => {
    expect(render({ schemaVersion: SCHEMA_VERSION, color: { ok: { value } } })).toMatch(
      /<span style="background: /,
    );
  });

  it("counts tokens with the right Czech plural form", () => {
    const one = render({ schemaVersion: SCHEMA_VERSION, color: { a: { value: "#000" } } });
    const three = render({
      schemaVersion: SCHEMA_VERSION,
      color: { a: { value: "#000" }, b: { value: "#111" }, c: { value: "#222" } },
    });

    expect(one).toContain("1 token<");
    expect(three).toContain("3 tokeny<");
    expect(render(doc)).toContain("2 tokeny<");
  });

  it("is deterministic, so regenerating an unchanged system produces no diff", () => {
    expect(render(doc)).toBe(render(doc));
  });
});

describe("renderDemo with references", () => {
  const withRefs = {
    schemaVersion: SCHEMA_VERSION,
    color: {
      "blue-600": { value: "#2563eb" },
      brand: { ref: "color.blue-600" },
      primary: { ref: "color.brand", css: "--color-primary" },
    },
  };

  it("paints a semantic token with the value it resolves to", () => {
    expect(render(withRefs)).toContain('<span style="background: #2563eb">');
  });

  it("shows the whole trail from a semantic token to its literal", () => {
    const html = render(withRefs);

    expect(html).toContain("color.brand → color.blue-600");
  });

  it("shows no trail for a primitive, which has nowhere to point", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      color: { "blue-600": { value: "#2563eb" } },
    });

    // Matching the class name alone would hit the stylesheet, which always
    // carries the rule whether or not any swatch uses it.
    expect(html).not.toContain('<div class="swatch__chain">');
  });

  it("shows the CSS custom property a token maps to", () => {
    expect(render(withRefs)).toContain("--color-primary");
  });

  it("escapes a hostile ref name on its way into the trail", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      color: {
        '"><img src=x>': { value: "#fff" },
        alias: { ref: 'color."><img src=x>' },
      },
    });

    expect(html).not.toContain("<img src=x>");
  });
});
