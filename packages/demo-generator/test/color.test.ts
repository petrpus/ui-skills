import { describe, expect, it } from "vitest";
import { contrastRatio, gradeContrast, parseColor, relativeLuminance } from "../src/color.ts";

describe("parseColor", () => {
  it.each([
    ["#fff", { r: 255, g: 255, b: 255 }],
    ["#FFF", { r: 255, g: 255, b: 255 }],
    ["#000000", { r: 0, g: 0, b: 0 }],
    ["#2563eb", { r: 37, g: 99, b: 235 }],
    ["#2563ebcc", { r: 37, g: 99, b: 235 }],
    ["#f00f", { r: 255, g: 0, b: 0 }],
    ["  #2563eb  ", { r: 37, g: 99, b: 235 }],
    ["white", { r: 255, g: 255, b: 255 }],
    ["BLACK", { r: 0, g: 0, b: 0 }],
    ["rgb(37, 99, 235)", { r: 37, g: 99, b: 235 }],
    ["rgb(37 99 235)", { r: 37, g: 99, b: 235 }],
    ["rgb(37 99 235 / 0.5)", { r: 37, g: 99, b: 235 }],
    ["rgba(37, 99, 235, 0.5)", { r: 37, g: 99, b: 235 }],
    ["rgb(100%, 0%, 0%)", { r: 255, g: 0, b: 0 }],
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
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});

describe("contrastRatio", () => {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };

  it("gives the WCAG maximum for black on white", () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 2);
  });

  it("gives 1 for a colour on itself", () => {
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it("does not care which way round the pair is", () => {
    const blue = { r: 37, g: 99, b: 235 };

    expect(contrastRatio(blue, white)).toBeCloseTo(contrastRatio(white, blue), 10);
  });

  it("matches known reference values", () => {
    // Checked against the WCAG formula: mid grey on white, and a common blue.
    expect(contrastRatio({ r: 119, g: 119, b: 119 }, white)).toBeCloseTo(4.48, 1);
    expect(contrastRatio({ r: 37, g: 99, b: 235 }, white)).toBeCloseTo(5.17, 1);
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
