import { resolveTokens, SCHEMA_VERSION, validateTokens } from "@ui-skills/schema";
import { describe, expect, it } from "vitest";
import { renderDemo } from "../src/render.ts";
import { showcaseSection } from "../src/showcase.ts";

function render(document: unknown): string {
  return renderDemo(resolveTokens(validateTokens(document)));
}

function showcase(document: unknown) {
  return showcaseSection(resolveTokens(validateTokens(document)));
}

/** Deliberately not named text/surface/primary — the section must not need that. */
const ownNaming = {
  schemaVersion: SCHEMA_VERSION,
  color: {
    ink: { value: "#18181b" },
    "ink-60": { value: "#52525b" },
    paper: { value: "#ffffff" },
    canvas: { value: "#f4f4f5" },
    rule: { value: "#e4e4e7" },
    brand: { value: "#2563eb" },
    "on-brand": { value: "#ffffff" },
    alarm: { value: "#dc2626" },
  },
  roles: {
    text: "color.ink",
    "text-muted": "color.ink-60",
    surface: "color.paper",
    "surface-2": "color.canvas",
    border: "color.rule",
    primary: "color.brand",
    "on-primary": "color.on-brand",
    danger: "color.alarm",
  },
  typography: {
    display: { size: "2.5rem", lineHeight: "1.15", weight: "600" },
    body: { size: "1rem", lineHeight: "1.6" },
    caption: { size: "0.8125rem", lineHeight: "1.45" },
  },
  spacing: {
    xs: { value: "4px" },
    sm: { value: "8px" },
    md: { value: "16px" },
    lg: { value: "32px" },
  },
  radius: { sm: { value: "4px" }, md: { value: "10px" }, lg: { value: "20px" } },
  shadow: {
    sm: { value: "0 1px 2px rgba(0,0,0,.06)" },
    md: { value: "0 6px 18px rgba(0,0,0,.10)" },
  },
};

describe("showcase section", () => {
  it("renders hero, cards and a form", () => {
    const html = render(ownNaming);

    expect(html).toContain('data-demo-section="showcase"');
    expect(html).toContain("showcase__hero");
    expect(html).toContain("showcase__cards");
    expect(html).toContain("showcase__form");
  });

  it("works with a system that never uses the role words as token names", () => {
    const html = render(ownNaming);

    expect(html).toMatch(/showcase__heading" style="[^"]*color: #18181b/);
    expect(html).toMatch(/showcase__button" style="[^"]*background: #2563eb/);
  });

  it("takes its spaces and radii from the project's own scales", () => {
    const html = render(ownNaming);

    // Middle of each scale: 16px of four spaces, 10px of three radii.
    expect(html).toMatch(/showcase__card" style="[^"]*padding: 16px/);
    expect(html).toMatch(/showcase__card" style="[^"]*border-radius: 10px/);
  });

  it("sets the hero at the system's own type step", () => {
    expect(render(ownNaming)).toMatch(/showcase__heading" style="[^"]*font-size: 2\.5rem/);
  });

  it("uses the danger role for the form's error line", () => {
    expect(render(ownNaming)).toMatch(/showcase__error" style="[^"]*color: #dc2626/);
  });

  it.each(["surface", "text", "primary", "on-primary"])(
    "leaves the section out when the %s role is missing",
    (missing) => {
      const roles = { ...ownNaming.roles } as Record<string, string>;
      delete roles[missing];
      const html = render({ ...ownNaming, roles });

      expect(html).not.toContain('data-demo-section="showcase"');
    },
  );

  it("says which roles are missing rather than leaving a silent hole", () => {
    const html = render({ ...ownNaming, roles: { text: "color.ink" } });

    expect(html).toContain("Ukázková sekce se nevykreslila");
    expect(html).toContain("surface");
    expect(html).toContain("primary");
  });

  it("leaves the rest of the demo untouched when it cannot draw itself", () => {
    const html = render({ ...ownNaming, roles: { text: "color.ink" } });

    expect(html).toContain('data-demo-section="color"');
    expect(html).toContain('data-demo-section="typography"');
    expect(html).toContain('data-demo-section="spacing"');
  });

  it("names every required role that is absent, not just the first", () => {
    const result = showcase({ ...ownNaming, roles: { text: "color.ink" } });

    expect(result.missing).toEqual(["surface", "primary", "on-primary"]);
  });

  it("degrades on optional roles instead of refusing to draw", () => {
    const html = render({
      ...ownNaming,
      roles: {
        text: "color.ink",
        surface: "color.paper",
        primary: "color.brand",
        "on-primary": "color.on-brand",
      },
    });

    expect(html).toContain('data-demo-section="showcase"');
    expect(html).not.toContain("border-color: undefined");
  });

  it("draws without any scales, since colours are what it truly needs", () => {
    const { color, roles } = ownNaming;
    const html = render({ schemaVersion: SCHEMA_VERSION, color, roles });

    expect(html).toContain('data-demo-section="showcase"');
    expect(html).not.toContain("padding: undefined");
    expect(html).not.toContain("border-radius: undefined");
  });

  it("keeps a hostile token value out of every style it writes", () => {
    const html = render({
      ...ownNaming,
      color: { ...ownNaming.color, brand: { value: 'url("https://evil.example.com/x.png")' } },
    });

    expect(html).not.toMatch(/style="[^"]*evil\.example\.com/i);
    expect(html).toContain('data-demo-section="showcase"');
  });

  it("resolves roles that point through a reference chain", () => {
    const html = render({
      ...ownNaming,
      color: { ...ownNaming.color, alias: { ref: "color.brand" } },
      roles: { ...ownNaming.roles, primary: "color.alias" },
    });

    expect(html).toMatch(/showcase__button" style="[^"]*background: #2563eb/);
  });
});

describe("the demo stays a picture, not an application", () => {
  it("carries no inline event handler anywhere", () => {
    // A form mock is the easy place to reach for onsubmit. The output is a
    // static file someone may open from a mail attachment; it runs nothing.
    expect(render(ownNaming)).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("carries no script and no form that could submit anywhere", () => {
    const html = render(ownNaming);

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<form/i);
  });
});
