export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * The handful of CSS keywords worth understanding without dragging in the whole
 * named-colour table: these are the ones that turn up in a token file as the
 * far ends of a scale.
 */
const KEYWORDS: Record<string, Rgb> = {
  white: { r: 255, g: 255, b: 255 },
  black: { r: 0, g: 0, b: 0 },
};

const HEX = /^#([0-9a-f]{3,8})$/i;
const RGB_FUNCTION = /^rgba?\(([^)]*)\)$/i;

function expandShorthand(hex: string): string {
  return hex
    .split("")
    .map((char) => char + char)
    .join("");
}

function parseHex(hex: string): Rgb | undefined {
  const digits = hex.length === 3 || hex.length === 4 ? expandShorthand(hex) : hex;
  if (digits.length !== 6 && digits.length !== 8) {
    return undefined;
  }

  const r = Number.parseInt(digits.slice(0, 2), 16);
  const g = Number.parseInt(digits.slice(2, 4), 16);
  const b = Number.parseInt(digits.slice(4, 6), 16);
  return { r, g, b };
}

function parseChannel(part: string): number | undefined {
  const trimmed = part.trim();
  if (trimmed === "") {
    return undefined;
  }
  if (trimmed.endsWith("%")) {
    const percent = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isNaN(percent) ? undefined : Math.round((percent / 100) * 255);
  }
  const value = Number.parseFloat(trimmed);
  return Number.isNaN(value) ? undefined : Math.round(value);
}

/**
 * Reads the colour notations a token file realistically uses. Anything else —
 * `var()`, `color-mix()`, an unknown keyword — comes back undefined rather than
 * guessed, so the demo can say the contrast is unknown instead of printing a
 * number that means nothing.
 */
export function parseColor(input: string): Rgb | undefined {
  const value = input.trim();

  const keyword = KEYWORDS[value.toLowerCase()];
  if (keyword !== undefined) {
    return keyword;
  }

  const hex = HEX.exec(value);
  if (hex?.[1] !== undefined) {
    return parseHex(hex[1]);
  }

  const rgb = RGB_FUNCTION.exec(value);
  if (rgb?.[1] !== undefined) {
    const channels = rgb[1]
      .split(rgb[1].includes(",") ? "," : /[\s/]+/)
      .filter((part) => part.trim() !== "")
      .slice(0, 3)
      .map(parseChannel);

    if (channels.length !== 3 || channels.some((channel) => channel === undefined)) {
      return undefined;
    }
    const [r, g, b] = channels as [number, number, number];
    return { r, g, b };
  }

  return undefined;
}

function channelLuminance(channel: number): number {
  const ratio = channel / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG 2.1 contrast ratio, between 1 and 21. */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastGrade = "AAA" | "AA" | "AA Large" | "fail";

/**
 * WCAG thresholds for text. `AA Large` applies to text at 18.66px bold or 24px
 * plain — the demo shows the grade a pair earns, not a verdict on where it may
 * be used, since it cannot know the size.
 */
export function gradeContrast(ratio: number): ContrastGrade {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "fail";
}
