import type { ResolvedGroup, ResolvedToken, ResolvedTypographyToken } from "@ui-skills/schema";
import { escapeHtml, isSafeCssValue, section } from "./html.ts";
import { SAMPLE_HEADING, SAMPLE_PARAGRAPH, SAMPLE_SHORT } from "./samples.ts";

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

/**
 * Reads a font size well enough to compare two of them. Undefined for anything
 * it cannot measure — `clamp()`, `calc()`, a bare keyword — so the caller can
 * fall back rather than order the scale by a number it invented.
 */
function sizeInPx(size: string): number | undefined {
  const match = /^(-?[\d.]+)\s*(px|pt|rem|em|ch|%)?$/i.exec(size.trim());
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
 */
function pairing(steps: readonly ResolvedTypographyToken[]): string {
  if (steps.length < 2) {
    return "";
  }

  const measured = steps.map((step) => ({ step, size: sizeInPx(step.size) }));
  const ordered = measured.every((entry) => entry.size !== undefined)
    ? [...measured].sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).map((entry) => entry.step)
    : steps;

  const bodyNames = ["body", "base", "text"];
  const heading = ordered[0];
  const named = ordered.find((step) => bodyNames.includes(step.name.toLowerCase()));
  const body =
    named !== undefined && named !== heading ? named : ordered.find((step) => step !== heading);

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
  const style = safeStyle([["width", token.value]]);

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
  const style = safeStyle([["border-radius", token.value]]);

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
  const style = safeStyle([["box-shadow", token.value]]);

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
