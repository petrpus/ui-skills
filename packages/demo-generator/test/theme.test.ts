import { resolveTokens, SCHEMA_VERSION, validateTokens } from "@ui-skills/schema";
import { describe, expect, it } from "vitest";
import { renderDemo } from "../src/render.ts";

function render(document: unknown): string {
  return renderDemo(resolveTokens(validateTokens(document)));
}

const withDark = {
  schemaVersion: SCHEMA_VERSION,
  color: {
    "zinc-100": { value: "#f4f4f5" },
    "zinc-900": { value: "#18181b" },
    ink: { value: "#18181b", dark: { value: "#fafafa" }, css: "--color-ink" },
    paper: { value: "#ffffff", dark: { ref: "color.zinc-900" } },
    brand: { value: "#2563eb" },
  },
  roles: {
    text: "color.ink",
    surface: "color.paper",
    primary: "color.brand",
    "on-primary": "color.zinc-100",
  },
};

const lightOnly = {
  schemaVersion: SCHEMA_VERSION,
  color: { ink: { value: "#18181b" }, paper: { value: "#ffffff" } },
  roles: { text: "color.ink", surface: "color.paper" },
};

describe("the dark toggle", () => {
  it("appears when at least one token changes", () => {
    const html = render(withDark);

    expect(html).toContain('id="theme-dark"');
    expect(html).toContain("Tmavý režim");
  });

  it("stays away when nothing changes, rather than offering a dead switch", () => {
    const html = render(lightOnly);

    expect(html).not.toContain('id="theme-dark"');
    expect(html).not.toContain("Tmavý režim");
  });

  it("switches without a single line of script", () => {
    const html = render(withDark);

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).toContain("html:has(#theme-dark:checked)");
  });

  it("still references nothing outside the file", () => {
    const html = render(withDark);

    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/@import/i);
  });
});

describe("token values across the two modes", () => {
  it("writes a switching token once as a custom property, in both faces", () => {
    const html = render(withDark);

    expect(html).toMatch(/--t-color-ink: #18181b;/);
    expect(html).toMatch(/html:has\(#theme-dark:checked\) \{[^}]*--t-color-ink: #fafafa;/);
  });

  it("paints through the property so the swatch follows the switch", () => {
    expect(render(withDark)).toContain("background: var(--t-color-ink)");
  });

  it("writes a token that never changes directly, with no property to look up", () => {
    const html = render(withDark);

    expect(html).toContain("background: #2563eb");
    expect(html).not.toContain("--t-color-brand");
  });

  it("resolves a dark override written as a reference", () => {
    expect(render(withDark)).toMatch(
      /html:has\(#theme-dark:checked\) \{[^}]*--t-color-paper: #18181b;/,
    );
  });

  it("says what a token becomes, so the value is readable without toggling", () => {
    expect(render(withDark)).toContain("tmavý režim: #fafafa");
  });

  it("escapes a token name that is not a valid property name", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      color: { "a b": { value: "#000", dark: { value: "#fff" } } },
    });

    expect(html).toContain("--t-color-a_20b");
    expect(html).not.toContain("--t-color-a b");
  });

  it("keeps an unsafe dark value out of the stylesheet", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      color: {
        sneaky: { value: "#000", dark: { value: 'url("https://evil.example.com/x.png")' } },
      },
    });

    expect(html).not.toContain('evil.example.com/x.png"');
    expect(html).not.toMatch(/--t-color-sneaky: url/);
  });
});

describe("contrast in both modes", () => {
  it("measures each pair twice and shows the one that applies", () => {
    const html = render(withDark);

    expect(html).toContain('class="only-light"');
    expect(html).toContain('class="only-dark"');
    expect(html).toContain("html:has(#theme-dark:checked) .only-light { display: none; }");
  });

  it("recomputes the ratio for the dark faces rather than reprinting the light one", () => {
    // #18181b on #ffffff is 17.72:1; in dark the pair becomes #fafafa on
    // #18181b, which is a different number.
    const html = render(withDark);

    expect(html).toContain("17.72:1");
    expect(html).toMatch(/only-dark">1[0-9]\.\d\d:1/);
  });

  it("writes a single measurement when there is no dark mode to compare", () => {
    const html = render(lightOnly);

    expect(html).not.toContain('class="only-dark"');
  });

  it("gives the badge its own grade per mode", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      color: {
        ink: { value: "#767676", dark: { value: "#fafafa" } },
        paper: { value: "#ffffff", dark: { value: "#18181b" } },
      },
      roles: { text: "color.ink", surface: "color.paper" },
    });

    // 4.54:1 in light is AA; the dark pair is far higher and reaches AAA.
    expect(html).toMatch(/only-light contrast__grade">[^<]*<span[^>]*>AA</);
    expect(html).toMatch(/only-dark contrast__grade">[^<]*<span[^>]*>AAA</);
  });
});
