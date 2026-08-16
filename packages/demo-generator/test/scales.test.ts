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

describe("pairing across scale orderings", () => {
  it("finds the heading in a scale written smallest first", () => {
    // The common ascending convention. Picking by position would set the
    // 0.75rem caption as the heading over 1rem body text.
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: {
        caption: { size: "0.75rem" },
        body: { size: "1rem" },
        h2: { size: "2rem" },
        h1: { size: "3rem" },
      },
    });

    expect(html).toContain("Párování h1 + body");
  });

  it("still pairs when the body step is written first", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { body: { size: "1rem" }, display: { size: "3rem" } },
    });

    expect(html).toContain("Párování display + body");
  });

  it("compares sizes across units rather than by number alone", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { small: { size: "14px" }, big: { size: "2rem" } },
    });

    expect(html).toContain("Párování big + small");
  });

  it("measures a fluid step by its upper bound", () => {
    // A clamp() hero is a normal way to write the biggest step. Treating it as
    // unmeasurable used to drag the whole ordering back to document order.
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: {
        caption: { size: "0.75rem" },
        body: { size: "1rem" },
        h2: { size: "2rem" },
        h1: { size: "clamp(2rem, 4vw, 3.5rem)" },
      },
    });

    expect(html).toContain("Párování h1 + body");
  });

  it("still compares the steps it can measure when one of them is a keyword", () => {
    // Two measurable steps compare meaningfully whatever the third one is.
    // Discarding that comparison would put `inherit` in the heading slot with
    // 3rem body text underneath it — a heading smaller than its own paragraph.
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: {
        odd: { size: "inherit" },
        small: { size: "0.875rem" },
        big: { size: "3rem" },
      },
    });

    expect(html).toContain("Párování big + small");
  });

  it("falls back to document order when nothing can be measured", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { first: { size: "inherit" }, second: { size: "initial" } },
    });

    expect(html).toContain("Párování first + second");
  });

  it("pairs the two distinct steps even when both could be called body", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { body: { size: "1rem" }, text: { size: "0.875rem" } },
    });

    expect(html).toContain("Párování body + text");
  });

  it("applies the body step's weight to the paired sample", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { display: { size: "3rem" }, body: { size: "1rem", weight: "300" } },
    });

    expect(html).toMatch(/pairing__body" style="[^"]*font-weight: 300/);
  });

  it("keeps a quoted font stack instead of dropping it for having quotes", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { body: { size: "1rem", family: '"Helvetica Neue", Arial, sans-serif' } },
    });

    expect(html).toContain("font-family: Helvetica Neue, Arial, sans-serif");
  });

  it("still refuses a family that is dangerous once unquoted", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { evil: { size: "1rem", family: '"url(https://evil.example.com/f.woff)"' } },
    });

    expect(html).not.toMatch(/style="[^"]*evil\.example\.com/i);
    expect(html).toMatch(/style="font-size: 1rem"/);
  });
});

describe("what counts as a measurable size", () => {
  it("does not crown a lone literal step on a scale written through variables", () => {
    // The case that prompted this: a team moving an existing CSS-variable type
    // system into tokens.json. Reading the one literal as the biggest made a
    // step named `tiny` the heading.
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: {
        h1: { size: "var(--fs-h1)" },
        h2: { size: "var(--fs-h2)" },
        tiny: { size: "0.5rem" },
      },
    });

    expect(html).toContain("Párování h1 + tiny");
    expect(html).not.toMatch(/Párování tiny/);
  });

  it.each([
    ["min", "min(4rem, 10vw)"],
    ["max", "max(5rem, 2vw)"],
    ["calc", "calc(10rem - 8rem)"],
  ])("treats %s as unmeasurable rather than reading a number out of it", (_label, size) => {
    // Each of these carries a number larger than the plain step beside it, so
    // reading that number out — as the greedy version did — would crown it.
    // min() caps rather than sets, calc() here resolves to 2rem, var() is
    // defined elsewhere entirely.
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { plain: { size: "3rem" }, odd: { size } },
    });

    expect(html).toContain("Párování plain + odd");
  });

  it("does not read a digit out of a custom property's name", () => {
    // `var(--fs-h1)` ends in a 1, and a reader looking for numbers finds it.
    // The partner is deliberately smaller than that stray digit, so a version
    // that harvests it crowns the wrong step.
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { plain: { size: "0.5px" }, odd: { size: "var(--fs-h1)" } },
    });

    expect(html).toContain("Párování plain + odd");
  });

  it("treats a bare keyword as unmeasurable", () => {
    // Documentation rather than a regression guard: a keyword carries no digits,
    // so no version of this ever read a size out of it. It is here so the
    // behaviour is stated somewhere.
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { plain: { size: "3rem" }, odd: { size: "inherit" } },
    });

    expect(html).toContain("Párování plain + odd");
  });

  it("measures a clamp by its ceiling, not by the largest number written in it", () => {
    // The greedy version read 6rem out of the floor and made `hero` the biggest
    // step. Its ceiling is 2rem, so `title` is.
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: {
        title: { size: "3rem" },
        hero: { size: "clamp(6rem, 4vw, 2rem)" },
        body: { size: "1rem" },
      },
    });

    expect(html).toContain("Párování title + body");
  });

  it("reads the ceiling of a clamp whose floor is itself a function", () => {
    // A common accessible-fluid pattern: a computed floor, a plain ceiling.
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: {
        body: { size: "1rem" },
        hero: { size: "clamp(max(1rem, 2vw), 5vw, 3.5rem)" },
      },
    });

    expect(html).toContain("Párování hero + body");
  });

  it("refuses a clamp that does not have three arguments", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: { first: { size: "clamp(1rem, 2rem)" }, second: { size: "0.5rem" } },
    });

    expect(html).toContain("Párování first + second");
  });

  it("gives up on a clamp whose upper bound it cannot read", () => {
    const html = render({
      schemaVersion: SCHEMA_VERSION,
      typography: {
        body: { size: "1rem" },
        hero: { size: "clamp(2rem, 4vw, 8vw)" },
      },
    });

    expect(html).toContain("Párování body + hero");
  });
});
