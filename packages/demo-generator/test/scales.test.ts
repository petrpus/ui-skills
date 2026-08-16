import { resolveTokens, SCHEMA_VERSION, validateTokens } from "@ui-skills/schema";
import { describe, expect, it } from "vitest";
import { renderDemo } from "../src/render.ts";

function render(document: unknown): string {
  return renderDemo(resolveTokens(validateTokens(document)));
}

const scales = {
  schemaVersion: SCHEMA_VERSION,
  typography: {
    display: { size: "3rem", lineHeight: "1.1", weight: "600" },
    body: { size: "1rem", lineHeight: "1.6", description: "Základní text" },
    small: { size: "0.875rem", lineHeight: "1.5" },
  },
  spacing: { "space-1": { value: "4px" }, "space-4": { value: "16px" } },
  radius: { sm: { value: "4px" }, lg: { value: "16px" } },
  shadow: { card: { value: "0 1px 2px rgba(0,0,0,.08)" } },
};

describe("typography section", () => {
  it("sets every step on real Czech text, diacritics and all", () => {
    const html = render(scales);

    expect(html).toContain('data-demo-section="typography"');
    expect(html).toContain("Příliš žluťoučký kůň úpěl ďábelské ódy");
  });

  it("applies each step's size and line height to its sample", () => {
    const html = render(scales);

    expect(html).toMatch(/font-size: 3rem; line-height: 1\.1; font-weight: 600/);
    expect(html).toMatch(/font-size: 1rem; line-height: 1\.6/);
  });

  it("lists the step's name and its numbers", () => {
    const html = render(scales);

    expect(html).toContain("display");
    expect(html).toContain("3rem");
    expect(html).toContain("1.1");
  });

  it("shows a heading paired with body text", () => {
    const html = render(scales);

    expect(html).toContain("Párování display + body");
    expect(html).toContain("Naší snahou je");
  });

  it("picks the smallest step as body when nothing is named for it", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { h1: { size: "3rem" }, caption: { size: "0.75rem" } },
    });

    expect(html).toContain("Párování h1 + caption");
  });

  it("shows no pairing when there is only one step to pair", () => {
    const html = render({ schemaVersion: SCHEMA_VERSION, typography: { only: { size: "1rem" } } });

    expect(html).toContain('data-demo-section="typography"');
    expect(html).not.toContain("Párování");
  });

  it("shows a step description when there is one", () => {
    expect(render(scales)).toContain("Základní text");
  });

  it("keeps a hostile size out of the sample's style attribute", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { evil: { size: 'url("https://evil.example.com/x.png")' } },
    });

    expect(html).not.toMatch(/style="[^"]*evil\.example\.com/i);
    expect(html).toContain("evil");
  });

  it("drops only the unsafe declaration, keeping the rest of the step", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { mixed: { size: "2rem", family: 'url("https://evil.example.com/f.woff")' } },
    });

    expect(html).toMatch(/style="font-size: 2rem"/);
    expect(html).not.toMatch(/style="[^"]*evil/i);
  });
});

describe("spacing, radius and shadow ladders", () => {
  it("draws a spacing bar at the token's own width", () => {
    const html = render(scales);

    expect(html).toContain('data-demo-section="spacing"');
    expect(html).toMatch(/ruler__bar" style="width: 16px"/);
    expect(html).toContain("space-4");
  });

  it("applies each radius to its tile", () => {
    const html = render(scales);

    expect(html).toContain('data-demo-section="radius"');
    expect(html).toMatch(/style="border-radius: 16px"/);
  });

  it("applies each shadow to its tile", () => {
    const html = render(scales);

    expect(html).toContain('data-demo-section="shadow"');
    expect(html).toContain("box-shadow: 0 1px 2px rgba(0,0,0,.08)");
  });

  it.each(["typography", "spacing", "radius", "shadow"])(
    "omits the %s section when the tokens do not cover it",
    (group) => {
      const html = render({ schemaVersion: SCHEMA_VERSION, color: { a: { value: "#000" } } });

      expect(html).not.toContain(`data-demo-section="${group}"`);
    },
  );

  it("omits a section whose group is present but empty", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      color: { a: { value: "#000" } },
      radius: {},
    });

    expect(html).not.toContain('data-demo-section="radius"');
  });

  it("counts tokens from every group, not just colours", () => {
    expect(render(scales)).toContain("8 tokenů");
  });

  it("resolves a reference inside a spacing token", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      spacing: { base: { value: "8px" }, gap: { ref: "spacing.base" } },
    });

    expect(html).toMatch(/ruler__bar" style="width: 8px"/);
  });
});
