import { describe, expect, it } from "vitest";
import {
  composite,
  contrastRatio,
  gradeContrast,
  parseColor,
  relativeLuminance,
} from "../src/color.ts";

describe("parseColor", () => {
  it.each([
    ["#fff", { r: 255, g: 255, b: 255, a: 1 }],
    ["#FFF", { r: 255, g: 255, b: 255, a: 1 }],
    ["#000000", { r: 0, g: 0, b: 0, a: 1 }],
    ["#2563eb", { r: 37, g: 99, b: 235, a: 1 }],
    ["#2563ebcc", { r: 37, g: 99, b: 235, a: 0.8 }],
    ["#f00f", { r: 255, g: 0, b: 0, a: 1 }],
    ["  #2563eb  ", { r: 37, g: 99, b: 235, a: 1 }],
    ["white", { r: 255, g: 255, b: 255, a: 1 }],
    ["BLACK", { r: 0, g: 0, b: 0, a: 1 }],
    ["rgb(37, 99, 235)", { r: 37, g: 99, b: 235, a: 1 }],
    ["rgb(37 99 235)", { r: 37, g: 99, b: 235, a: 1 }],
    ["rgb(37 99 235 / 0.5)", { r: 37, g: 99, b: 235, a: 0.5 }],
    ["rgba(37, 99, 235, 0.5)", { r: 37, g: 99, b: 235, a: 0.5 }],
    ["rgb(100%, 0%, 0%)", { r: 255, g: 0, b: 0, a: 1 }],
  ])("reads %s", (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it.each([
    ["var(--color-primary)"],
    ["color-mix(in oklch, red 50%, blue)"],
    ["oklch(0.65 0.2 255)"],
    ["rebeccapurple"],
    ["currentColor"],
    ["#12345"],
    ["rgb(37, 99)"],
    ["rgb()"],
    ["rgb(a, b, c)"],
    [""],
  ])("returns nothing for %s rather than guessing", (input) => {
    expect(parseColor(input)).toBeUndefined();
  });
});

describe("relativeLuminance", () => {
  it("puts white at 1 and black at 0", () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBeCloseTo(0, 5);
  });
});

describe("contrastRatio", () => {
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const black = { r: 0, g: 0, b: 0, a: 1 };

  it("gives the WCAG maximum for black on white", () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 2);
  });

  it("gives 1 for a colour on itself", () => {
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it("does not care which way round the pair is", () => {
    const blue = { r: 37, g: 99, b: 235, a: 1 };

    expect(contrastRatio(blue, white)).toBeCloseTo(contrastRatio(white, blue), 10);
  });

  it("matches known reference values", () => {
    // Checked against the WCAG formula: mid grey on white, and a common blue.
    expect(contrastRatio({ r: 119, g: 119, b: 119, a: 1 }, white)).toBeCloseTo(4.48, 1);
    expect(contrastRatio({ r: 37, g: 99, b: 235, a: 1 }, white)).toBeCloseTo(5.17, 1);
  });
});

describe("gradeContrast", () => {
  it.each([
    [21, "AAA"],
    [7, "AAA"],
    [6.99, "AA"],
    [4.5, "AA"],
    [4.49, "AA Large"],
    [3, "AA Large"],
    [2.99, "fail"],
    [1, "fail"],
  ])("grades %s as %s", (ratio, expected) => {
    expect(gradeContrast(ratio)).toBe(expected);
  });
});

describe("alpha", () => {
  const white = { r: 255, g: 255, b: 255, a: 1 };

  it.each([
    ["rgb(999, 999, 999)", { r: 255, g: 255, b: 255, a: 1 }],
    ["rgb(-50, -1, 0)", { r: 0, g: 0, b: 0, a: 1 }],
    ["rgb(200%, 0%, 0%)", { r: 255, g: 0, b: 0, a: 1 }],
    ["rgba(0, 0, 0, 7)", { r: 0, g: 0, b: 0, a: 1 }],
    ["rgba(0, 0, 0, -3)", { r: 0, g: 0, b: 0, a: 0 }],
  ])("clamps %s into range instead of letting it out", (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it("keeps the contrast ratio inside the documented 1–21 range", () => {
    const absurd = parseColor("rgb(999, 999, 999)");
    const black = parseColor("#000");

    expect(contrastRatio(absurd as never, black as never)).toBeLessThanOrEqual(21);
  });

  it("reads transparent as fully see-through, not as black", () => {
    expect(parseColor("transparent")?.a).toBe(0);
  });

  it("paints a half-transparent black onto white as mid grey", () => {
    const painted = composite({ r: 0, g: 0, b: 0, a: 0.5 }, white);

    expect(painted).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it("leaves an opaque colour untouched when compositing", () => {
    const blue = { r: 37, g: 99, b: 235, a: 1 };

    expect(composite(blue, white)).toEqual(blue);
  });

  it("makes a fully transparent foreground disappear into its backdrop", () => {
    expect(composite({ r: 0, g: 0, b: 0, a: 0 }, white)).toEqual(white);
  });
});
