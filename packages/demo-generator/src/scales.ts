import type { ResolvedGroup, ResolvedToken, ResolvedTypographyToken } from "@ui-skills/schema";
import { escapeHtml, isSafeCssValue, section } from "./html.ts";
import { SAMPLE_HEADING, SAMPLE_PARAGRAPH, SAMPLE_SHORT } from "./samples.ts";
import { tokenCss } from "./theme.ts";

/**
 * Drops the quotes around font names. CSS accepts an unquoted family list, and
 * the value guard refuses quotes outright — without this, the idiomatic way to
 * write a stack (`"Helvetica Neue", Arial`) would silently lose the preview it
 * was meant to show. Anything actually dangerous still fails the guard after
 * unquoting.
 */
function unquoteFamily(value: string): string {
  return value.replace(/["']/g, "");
}

/**
 * Builds a `style` attribute from declaration pairs, dropping any whose value
 * would not be safe to inline. Same guard the swatches use — every value that
 * reaches the page as CSS goes through it.
 *
 * Property names are always literals written here, never taken from a token, so
 * a document can influence what a declaration says but never which property it
 * sets.
 */
function safeStyle(declarations: readonly (readonly [string, string | undefined])[]): string {
  const safe = declarations
    .filter(
      (entry): entry is readonly [string, string] =>
        entry[1] !== undefined && isSafeCssValue(entry[1]),
    )
    .map(([property, value]) => `${property}: ${escapeHtml(value)}`);

  return safe.length > 0 ? ` style="${safe.join("; ")}"` : "";
}

function typographyMeta(step: ResolvedTypographyToken): string {
  const parts = [
    step.size,
    step.lineHeight ? `/ ${step.lineHeight}` : "",
    step.weight ? `· ${step.weight}` : "",
    step.letterSpacing ? `· ${step.letterSpacing}` : "",
  ].filter(Boolean);

  return escapeHtml(parts.join(" "));
}

function typographyStep(step: ResolvedTypographyToken): string {
  const style = safeStyle([
    ["font-size", step.size],
    ["line-height", step.lineHeight],
    ["font-weight", step.weight],
    ["letter-spacing", step.letterSpacing],
    ["font-family", step.family === undefined ? undefined : unquoteFamily(step.family)],
  ]);

  const note = step.description ? `<p class="scale__note">${escapeHtml(step.description)}</p>` : "";
  const cssVar = step.css ? `<span class="scale__css">${escapeHtml(step.css)}</span>` : "";

  return `<article class="type">
      <div class="type__label">
        <span class="type__name">${escapeHtml(step.name)}</span>
        <span class="type__meta">${typographyMeta(step)}</span>
        ${cssVar}
      </div>
      <p class="type__sample"${style}>${escapeHtml(SAMPLE_HEADING)}</p>
      ${note}
    </article>`;
}

/** Rough px equivalents, enough to order a scale — not to lay anything out. */
const UNIT_SCALE: Record<string, number> = {
  px: 1,
  pt: 4 / 3,
  rem: 16,
  em: 16,
  ch: 8,
  "%": 0.16,
};

const BARE_LENGTH = /^(-?[\d.]+)\s*(px|pt|rem|em|ch|%)?$/i;
const CLAMP = /^clamp\((.*)\)$/is;

/**
 * Splits a function's arguments on the commas that belong to it, ignoring those
 * nested inside another call. `clamp(max(1rem, 2vw), 5vw, 3.5rem)` has three
 * arguments, not four, and its ceiling is the plain length at the end.
 */
function topLevelArguments(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** A plain length, or nothing. No arithmetic, no functions, no guessing. */
function lengthOf(text: string): number | undefined {
  const match = BARE_LENGTH.exec(text.trim());
  if (match?.[1] === undefined) {
    return undefined;
  }

  const amount = Number.parseFloat(match[1]);
  if (Number.isNaN(amount)) {
    return undefined;
  }

  const unit = match[2]?.toLowerCase();
  return amount * (unit === undefined ? 1 : (UNIT_SCALE[unit] ?? 1));
}

/**
 * Reads a font size well enough to compare two of them.
 *
 * A plain length measures as itself. `clamp(2rem, 4vw, 3.5rem)` measures as its
 * upper bound, which is what decides whether a fluid step is the biggest on the
 * scale. Everything else — `calc()`, `min()`, `max()`, `var()`, a keyword —
 * measures as nothing.
 *
 * An earlier version took the largest number appearing anywhere in the string.
 * That read `min(4rem, 10vw)` as 64 when a narrow window renders it at 37, and
 * `calc(100% - 2rem)` as 32 when the result is negative. A number sitting inside
 * an expression is not the size the expression produces.
 */
function sizeInPx(size: string): number | undefined {
  const value = size.trim();

  const bare = lengthOf(value);
  if (bare !== undefined) {
    return bare;
  }

  const clamp = CLAMP.exec(value);
  if (clamp?.[1] === undefined) {
    return undefined;
  }

  // A clamp has exactly three arguments. Reading the last of some other number
  // of them would be guessing at what a malformed value meant.
  const args = topLevelArguments(clamp[1]);
  return args.length === 3 ? lengthOf(args[2] ?? "") : undefined;
}

/**
 * The measurable steps, biggest first — or nothing when there are fewer than
 * two of them.
 *
 * A single measurable step among unreadable ones wins its superlative by having
 * nobody to lose to: `tiny: 0.5rem` beside `h1: var(--fs-h1)` was crowned the
 * heading purely for being the only number in sight. Two measurable steps do
 * compare meaningfully, and that comparison is worth keeping even when a third
 * step is a keyword — throwing it away would let the keyword take the heading
 * slot and leave body text larger than the heading above it.
 */
function measuredSteps(
  steps: readonly ResolvedTypographyToken[],
): readonly ResolvedTypographyToken[] {
  const measured = steps
    .map((step) => ({ step, size: sizeInPx(step.size) }))
    .filter((entry): entry is { step: ResolvedTypographyToken; size: number } => {
      return entry.size !== undefined;
    });

  if (measured.length < 2) {
    return [];
  }

  return measured.sort((a, b) => b.size - a.size).map((entry) => entry.step);
}

/**
 * The pairing a reader actually judges: a heading with body text under it.
 *
 * The heading is the largest step by measured size, not the first one written —
 * scales are authored in both directions, and picking by position sets the
 * smallest step as a heading for everyone who writes theirs ascending.
 *
 * The body is the step named for it (`body`, `base`, `text`), falling back to
 * the smallest. When the two would be the same step, the next distinct one is
 * used instead of dropping the pairing: a two-step scale is exactly the case
 * that most needs showing.
 *
 * When a size cannot be read the pairing is a guess either way — a step sized
 * `var(--fs-h1)` has no size in this document to render at — so it is made from
 * the order the author wrote rather than dropped.
 */
function pairing(steps: readonly ResolvedTypographyToken[]): string {
  if (steps.length < 2) {
    return "";
  }

  // Sorted biggest-first when every size could be read, otherwise the order the
  // author wrote. Both are then read the same way: front is the heading, back is
  // the body — which on a measured scale means largest and smallest, and on an
  // unmeasured one means first and last written.
  const measured = measuredSteps(steps);
  const ordered = measured.length > 0 ? measured : steps;
  const bodyNames = ["body", "base", "text"];

  const heading = ordered[0];
  const named = ordered.find((step) => bodyNames.includes(step.name.toLowerCase()));
  const body =
    named !== undefined && named !== heading ? named : ordered.findLast((step) => step !== heading);

  if (heading === undefined || body === undefined) {
    return "";
  }

  const headingStyle = safeStyle([
    ["font-size", heading.size],
    ["line-height", heading.lineHeight],
    ["font-weight", heading.weight],
    ["letter-spacing", heading.letterSpacing],
    ["font-family", heading.family === undefined ? undefined : unquoteFamily(heading.family)],
  ]);
  const bodyStyle = safeStyle([
    ["font-size", body.size],
    ["line-height", body.lineHeight],
    ["font-weight", body.weight],
    ["letter-spacing", body.letterSpacing],
    ["font-family", body.family === undefined ? undefined : unquoteFamily(body.family)],
  ]);

  return `<article class="pairing">
      <p class="scale__caption">Párování ${escapeHtml(heading.name)} + ${escapeHtml(body.name)}</p>
      <h3 class="pairing__heading"${headingStyle}>${escapeHtml(SAMPLE_SHORT)}</h3>
      <p class="pairing__body"${bodyStyle}>${escapeHtml(SAMPLE_PARAGRAPH)}</p>
    </article>`;
}

export function typographySection(steps: readonly ResolvedTypographyToken[]): string {
  if (steps.length === 0) {
    return "";
  }

  const body = `<div class="types">
    ${steps.map(typographyStep).join("\n    ")}
    ${pairing(steps)}
  </div>`;

  return section("typography", "Typografie", body);
}

function spacingRow(token: ResolvedToken): string {
  const style = safeStyle([["width", tokenCss(token)]]);

  return `<article class="ruler">
      <div class="ruler__label">
        <span class="ruler__name">${escapeHtml(token.name)}</span>
        <span class="ruler__value">${escapeHtml(token.value)}</span>
      </div>
      <div class="ruler__bar"${style}></div>
    </article>`;
}

export function spacingSection(group: ResolvedGroup): string {
  if (group.length === 0) {
    return "";
  }

  return section(
    "spacing",
    "Spacing",
    `<div class="rulers">\n    ${group.map(spacingRow).join("\n    ")}\n  </div>`,
  );
}

function radiusTile(token: ResolvedToken): string {
  const style = safeStyle([["border-radius", tokenCss(token)]]);

  return `<article class="tile">
      <div class="tile__shape tile__shape--radius"${style}></div>
      <div class="tile__name">${escapeHtml(token.name)}</div>
      <div class="tile__value">${escapeHtml(token.value)}</div>
    </article>`;
}

export function radiusSection(group: ResolvedGroup): string {
  if (group.length === 0) {
    return "";
  }

  return section(
    "radius",
    "Zaoblení",
    `<div class="tiles">\n    ${group.map(radiusTile).join("\n    ")}\n  </div>`,
  );
}

function shadowTile(token: ResolvedToken): string {
  const style = safeStyle([["box-shadow", tokenCss(token)]]);

  return `<article class="tile">
      <div class="tile__shape tile__shape--shadow"${style}></div>
      <div class="tile__name">${escapeHtml(token.name)}</div>
      <div class="tile__value">${escapeHtml(token.value)}</div>
    </article>`;
}

export function shadowSection(group: ResolvedGroup): string {
  if (group.length === 0) {
    return "";
  }

  return section(
    "shadow",
    "Stíny",
    `<div class="tiles tiles--roomy">\n    ${group.map(shadowTile).join("\n    ")}\n  </div>`,
  );
}
