import type { ResolvedGroup, ResolvedToken, ResolvedTokens } from "@ui-skills/schema";
import { type ContrastCheck, type ContrastReport, reportContrast } from "./contrast.ts";
import { escapeHtml, isSafeCssValue, section } from "./html.ts";
import { radiusSection, shadowSection, spacingSection, typographySection } from "./scales.ts";
import { showcaseSection } from "./showcase.ts";
import { DEMO_STYLES } from "./styles.ts";
import { THEME_TOGGLE, themeStyles, tokenCss } from "./theme.ts";

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
  const paint = tokenCss(token);
  const chip = isSafeCssValue(paint)
    ? `<span style="background: ${escapeHtml(paint)}"></span>`
    : "<span></span>";
  const darkNote = token.dark
    ? `<div class="swatch__dark">tmavý režim: ${escapeHtml(token.dark)}</div>`
    : "";
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
        ${darkNote}
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

/**
 * AA Large is the narrowest pass — it only holds for large text — so it does not
 * get the same green as a grade that passes everywhere.
 */
const BADGE_TONE = {
  AAA: "pass",
  AA: "pass",
  "AA Large": "partial",
  fail: "fail",
} as const;

const SOURCE_LABEL: Record<ContrastReport["source"], string> = {
  roles: "podle rolí",
  convention: "podle konvence jmen (role nejsou zadané)",
  fallback: "proti černé a bílé (role ani konvence nejsou k dispozici)",
};

/**
 * One measurement, wrapped in a single element that carries nothing but its
 * mode.
 *
 * The wrapper exists so that showing and hiding is decided by one class on one
 * element. An earlier version put the mode class on the inner parts alongside
 * their layout classes, and a same-specificity layout rule written later in the
 * stylesheet quietly won — leaving both modes' badges on screen at once.
 */
function measurement(entry: ContrastCheck, mode: "light" | "dark" | undefined): string {
  const ratio = entry.ratio === undefined ? "—" : `${entry.ratio.toFixed(2)}:1`;
  const grade =
    entry.grade === undefined
      ? '<span class="badge badge--unknown">nelze spočítat</span>'
      : `<span class="badge badge--${BADGE_TONE[entry.grade]}">${escapeHtml(entry.grade)}</span>`;
  const modeClass = mode === undefined ? "" : ` mode--${mode}`;

  return `<span class="mode${modeClass}">${ratio}<span class="contrast__grade">${grade}</span></span>`;
}

function contrastRow(entry: ContrastCheck, darkEntry: ContrastCheck | undefined): string {
  const background = tokenCss(entry.bg);
  const foreground = tokenCss(entry.fg);
  const safe = isSafeCssValue(background) && isSafeCssValue(foreground);
  const preview = safe
    ? `<td class="contrast__preview" style="background: ${escapeHtml(background)}; color: ${escapeHtml(foreground)}">Příliš žluťoučký kůň</td>`
    : '<td class="contrast__preview contrast__preview--none">nelze vykreslit</td>';

  // Both measurements are written out and the stylesheet shows the one that
  // belongs to the current mode. The numbers cannot be recomputed in the page:
  // there is no script, by design.
  const numbers = darkEntry
    ? `${measurement(entry, "light")}${measurement(darkEntry, "dark")}`
    : measurement(entry, undefined);

  return `<tr>
        <td class="contrast__pair"><span>${escapeHtml(entry.fg.name)}</span> na <span>${escapeHtml(entry.bg.name)}</span></td>
        ${preview}
        <td class="contrast__ratio">${numbers}</td>
      </tr>`;
}

function pairKey(entry: ContrastCheck): string {
  return `${entry.fg.qualifiedName}|${entry.bg.qualifiedName}`;
}

function contrastSection(report: ContrastReport, darkReport: ContrastReport | undefined): string {
  // Matched by which tokens the pair is, not by where it sits in the list. The
  // two reports happen to come out in the same order today, and relying on that
  // would put a light ratio next to the wrong dark one the day they diverge.
  const darkByPair = new Map((darkReport?.checks ?? []).map((entry) => [pairKey(entry), entry]));
  const rows = report.checks
    .map((entry) => contrastRow(entry, darkByPair.get(pairKey(entry))))
    .join("\n      ");
  const body = `<p class="section__note">Dvojice určeny ${escapeHtml(SOURCE_LABEL[report.source])}.</p>
  <table class="contrast">
    <tbody>
      ${rows}
    </tbody>
  </table>`;

  return section("contrast", "Kontrast", body);
}

function countTokens(tokens: ResolvedTokens): number {
  return (
    (tokens.color?.length ?? 0) +
    (tokens.typography?.length ?? 0) +
    (tokens.spacing?.length ?? 0) +
    (tokens.radius?.length ?? 0) +
    (tokens.shadow?.length ?? 0)
  );
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
  const theme = themeStyles(tokens);
  const darkContrast = theme.hasDark ? reportContrast(tokens, "dark") : undefined;
  const showcase = showcaseSection(tokens);
  const sections = [
    tokens.color ? colorSection(tokens.color) : "",
    contrast ? contrastSection(contrast, darkContrast) : "",
    tokens.typography ? typographySection(tokens.typography) : "",
    tokens.spacing ? spacingSection(tokens.spacing) : "",
    tokens.radius ? radiusSection(tokens.radius) : "",
    tokens.shadow ? shadowSection(tokens.shadow) : "",
    // Last on purpose: the ladders above say what the system contains, and this
    // says whether it holds together. Reading it the other way round asks
    // someone to judge a composition before seeing its parts.
    showcase.html,
  ].filter(Boolean);

  // Absent because roles are missing, not because something broke — said out
  // loud so nobody goes looking for a bug in the generator.
  const showcaseNote =
    showcase.missing.length > 0 && sections.length > 0
      ? `<p class="empty">Ukázková sekce se nevykreslila — chybí role: ${escapeHtml(
          showcase.missing.join(", "),
        )}. Doplň je do tokens.json v sekci "roles".</p>`
      : "";

  const body =
    sections.length > 0
      ? [...sections, showcaseNote].filter(Boolean).join("\n\n  ")
      : '<p class="empty">Zatím žádné tokeny k zobrazení. Doplň je do tokens.json a spusť generátor znovu.</p>';

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${DEMO_STYLES}
${theme.css}
</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <p class="masthead__eyebrow">Design systém</p>
    <h1 class="masthead__title">${escapeHtml(title)}</h1>
    <p class="masthead__meta">${tokenCountLabel(count)}</p>
    ${theme.hasDark ? THEME_TOGGLE : ""}
  </header>

  ${body}
</div>
</body>
</html>
`;
}
