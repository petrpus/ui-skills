import { resolveTokens, SCHEMA_VERSION, validateTokens } from "@ui-skills/schema";
import { describe, expect, it } from "vitest";
import { renderDemo } from "../src/render.ts";
import { tokenVar } from "../src/theme.ts";

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

  it.each([
    ["a semicolon", "#000; } html { background: red"],
    ["a closing brace", "red } html { background: pink"],
    ["a closing style tag", "red</style><style>html{background:red}"],
    ["a newline", "red;\n} html { background: red"],
  ])("keeps a dark value containing %s out of the stylesheet", (_label, dark) => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      color: { evil: { value: "#000", dark: { value: dark } } },
    });
    const stylesheet = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";

    expect(stylesheet).not.toContain("background: red");
    expect(stylesheet).not.toContain("background: pink");
    expect(html.match(/<style>/g) ?? []).toHaveLength(1);
  });

  it("gives two token names that escape alike their own property", () => {
    // `_1a` could be code point 0x1a, or 0x1 followed by the letter a. With an
    // open-ended escape both tokens claimed one property and the later one
    // silently repainted the earlier.
    const tokens = resolveTokens(
      validateTokens({
        schemaVersion: SCHEMA_VERSION,
        color: {
          "\u0001a": { value: "#111111" },
          "\u001a": { value: "#222222" },
        },
      }),
    );
    const [first, second] = tokens.color ?? [];

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(tokenVar(first as never)).not.toBe(tokenVar(second as never));
  });

  it("escapes a token name that is not a valid property name", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      color: { "a b": { value: "#000", dark: { value: "#fff" } } },
    });

    expect(html).toContain("--t-color-a_20_b");
    expect(html).not.toContain("--t-color-a b");
  });

  it("keeps an unsafe dark value out of the stylesheet", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      color: {
        sneaky: { value: "#000", dark: { value: 'url("https://evil.example.com/x.png")' } },
      },
    });
    // Asserting the escaped text is absent from the whole document would pass
    // for any input containing a quote, since escapeHtml handles that
    // everywhere. The claim worth making is that it never becomes CSS.
    const stylesheet = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";

    expect(stylesheet).not.toContain("evil.example.com");
    expect(stylesheet).not.toMatch(/--t-color-sneaky: url/);
  });
});

describe("contrast in both modes", () => {
  it("measures each pair twice and shows the one that applies", () => {
    const html = render(withDark);

    expect(html).toContain('class="mode mode--light"');
    expect(html).toContain('class="mode mode--dark"');
    expect(html).toContain(
      "html:has(#theme-dark:checked) .contrast__ratio .mode--light { display: none; }",
    );
  });

  it("puts nothing but the mode on the element whose visibility it decides", () => {
    // The cascade decides this, and a same-specificity rule written later in the
    // stylesheet wins. Keeping the wrapper free of layout classes is what makes
    // one rule enough — previously the badge carried both, and a later
    // `.contrast__grade { display: block }` un-hid the mode that should be gone.
    const html = render(withDark);

    const classAttributes = [...html.matchAll(/class="([^"]*mode--[^"]*)"/g)].map((m) => m[1]);

    expect(classAttributes.length).toBeGreaterThan(0);
    for (const attribute of classAttributes) {
      expect(["mode mode--light", "mode mode--dark"]).toContain(attribute);
    }
  });

  it("recomputes the ratio for the dark faces rather than reprinting the light one", () => {
    // #18181b on #ffffff is 17.72:1; in dark the pair becomes #fafafa on
    // #18181b, which is a different number.
    const html = render(withDark);

    expect(html).toContain("17.72:1");
    expect(html).toMatch(/mode mode--dark">1[0-9]\.\d\d:1/);
  });

  it("writes a single measurement when there is no dark mode to compare", () => {
    const html = render(lightOnly);

    // Matching the bare class name would hit the stylesheet, which always
    // carries the rules whether or not any element uses them.
    expect(html).not.toMatch(/class="[^"]*mode--/);
    expect(html).toContain('class="mode"');
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
    expect(html).toMatch(/mode--light">4\.54:1<span class="contrast__grade"><span[^>]*>AA</);
    expect(html).toMatch(/mode--dark">1[0-9]\.\d\d:1<span class="contrast__grade"><span[^>]*>AAA</);
  });
});
