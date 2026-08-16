import type { TokenGroup, Tokens } from "@ui-skills/schema";
import { escapeHtml, isSafeCssValue, section } from "./html.ts";
import { DEMO_STYLES } from "./styles.ts";

function swatch(name: string, value: string, description: string | undefined): string {
  const chip = isSafeCssValue(value)
    ? `<span style="background: ${escapeHtml(value)}"></span>`
    : "<span></span>";
  const note = description ? `<p class="swatch__note">${escapeHtml(description)}</p>` : "";

  return `<article class="swatch">
      <div class="swatch__chip">${chip}</div>
      <div class="swatch__body">
        <div class="swatch__name">${escapeHtml(name)}</div>
        <div class="swatch__value">${escapeHtml(value)}</div>
        ${note}
      </div>
    </article>`;
}

function colorSection(group: TokenGroup): string {
  const entries = Object.entries(group);
  if (entries.length === 0) {
    return "";
  }

  const swatches = entries
    .map(([name, token]) => swatch(name, token.value, token.description))
    .join("\n    ");

  return section("color", "Barvy", `<div class="swatches">\n    ${swatches}\n  </div>`);
}

function countTokens(tokens: Tokens): number {
  return Object.keys(tokens.color ?? {}).length;
}

/** Czech needs three forms: 1 token, 2–4 tokeny, 0 and 5+ tokenů. */
function tokenCountLabel(count: number): string {
  if (count === 1) return "1 token";
  if (count >= 2 && count <= 4) return `${count} tokeny`;
  return `${count} tokenů`;
}

/**
 * The single seam of this package: tokens in, a self-contained HTML document
 * out. Deliberately free of IO and of any notion of where the tokens came from
 * or where the page will be written.
 *
 * The output never references an external resource — no CDN, no webfont, no
 * script. That is what makes the result mailable and openable offline, and it
 * is asserted by the test suite rather than left to review.
 */
export function renderDemo(tokens: Tokens): string {
  const title = tokens.name ?? "Design systém";
  const count = countTokens(tokens);
  const sections = [tokens.color ? colorSection(tokens.color) : ""].filter(Boolean);

  const body =
    sections.length > 0
      ? sections.join("\n\n  ")
      : '<p class="empty">Zatím žádné tokeny k zobrazení. Doplň je do tokens.json a spusť generátor znovu.</p>';

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${DEMO_STYLES}
</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <p class="masthead__eyebrow">Design systém</p>
    <h1 class="masthead__title">${escapeHtml(title)}</h1>
    <p class="masthead__meta">${tokenCountLabel(count)}</p>
  </header>

  ${body}
</div>
</body>
</html>
`;
}
