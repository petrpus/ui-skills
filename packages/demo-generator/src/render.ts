import type { ResolvedGroup, ResolvedToken, ResolvedTokens } from "@ui-skills/schema";
import { type ContrastCheck, type ContrastReport, reportContrast } from "./contrast.ts";
import { escapeHtml, isSafeCssValue, section } from "./html.ts";
import { DEMO_STYLES } from "./styles.ts";

/**
 * Shows where a semantic token gets its value: `primary → blue-600`. A primitive
 * has nothing to show, so it gets nothing rather than a chain of one.
 */
function chainTrail(chain: readonly string[]): string {
  if (chain.length < 2) {
    return "";
  }

  const hops = chain
    .slice(1)
    .map((step) => escapeHtml(step))
    .join(" → ");
  return `<div class="swatch__chain">→ ${hops}</div>`;
}

function swatch(token: ResolvedToken): string {
  const chip = isSafeCssValue(token.value)
    ? `<span style="background: ${escapeHtml(token.value)}"></span>`
    : "<span></span>";
  const cssVar = token.css ? `<div class="swatch__css">${escapeHtml(token.css)}</div>` : "";
  const note = token.description
    ? `<p class="swatch__note">${escapeHtml(token.description)}</p>`
    : "";

  return `<article class="swatch">
      <div class="swatch__chip">${chip}</div>
      <div class="swatch__body">
        <div class="swatch__name">${escapeHtml(token.name)}</div>
        <div class="swatch__value">${escapeHtml(token.value)}</div>
        ${chainTrail(token.chain)}
        ${cssVar}
        ${note}
      </div>
    </article>`;
}

function colorSection(group: ResolvedGroup): string {
  if (group.length === 0) {
    return "";
  }

  const swatches = group.map(swatch).join("\n    ");
  return section("color", "Barvy", `<div class="swatches">\n    ${swatches}\n  </div>`);
}

const SOURCE_LABEL: Record<ContrastReport["source"], string> = {
  roles: "podle rolí",
  convention: "podle konvence jmen (role nejsou zadané)",
  fallback: "proti černé a bílé (role ani konvence nejsou k dispozici)",
};

function contrastRow(entry: ContrastCheck): string {
  const safe = isSafeCssValue(entry.fg.value) && isSafeCssValue(entry.bg.value);
  const preview = safe
    ? `<td class="contrast__preview" style="background: ${escapeHtml(entry.bg.value)}; color: ${escapeHtml(entry.fg.value)}">Příliš žluťoučký kůň</td>`
    : '<td class="contrast__preview contrast__preview--none">nelze vykreslit</td>';

  const ratio =
    entry.ratio === undefined
      ? '<td class="contrast__ratio">—</td>'
      : `<td class="contrast__ratio">${entry.ratio.toFixed(2)}:1</td>`;

  const grade =
    entry.grade === undefined
      ? '<td><span class="badge badge--unknown">nelze spočítat</span></td>'
      : `<td><span class="badge badge--${entry.grade === "fail" ? "fail" : "pass"}">${escapeHtml(entry.grade)}</span></td>`;

  return `<tr>
        <td class="contrast__pair"><span>${escapeHtml(entry.fg.name)}</span> na <span>${escapeHtml(entry.bg.name)}</span></td>
        ${preview}
        ${ratio}
        ${grade}
      </tr>`;
}

function contrastSection(report: ContrastReport): string {
  const rows = report.checks.map(contrastRow).join("\n      ");
  const body = `<p class="section__note">Dvojice určeny ${escapeHtml(SOURCE_LABEL[report.source])}.</p>
  <table class="contrast">
    <tbody>
      ${rows}
    </tbody>
  </table>`;

  return section("contrast", "Kontrast", body);
}

function countTokens(tokens: ResolvedTokens): number {
  return tokens.color?.length ?? 0;
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
export function renderDemo(tokens: ResolvedTokens): string {
  const title = tokens.name ?? "Design systém";
  const count = countTokens(tokens);
  const contrast = reportContrast(tokens);
  const sections = [
    tokens.color ? colorSection(tokens.color) : "",
    contrast ? contrastSection(contrast) : "",
  ].filter(Boolean);

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
