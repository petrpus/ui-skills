import type { ResolvedRoles, ResolvedTokens, RoleName } from "@ui-skills/schema";
import { escapeHtml, isSafeCssValue, section } from "./html.ts";

/**
 * Roles the composite section cannot be drawn without: a surface to sit on,
 * text to read, and an action with something legible on it. Everything else it
 * uses degrades — a missing border falls back to the second surface, missing
 * muted text to ordinary text.
 */
const REQUIRED_ROLES: readonly RoleName[] = ["surface", "text", "primary", "on-primary"];

/** A value taken from a token, or nothing — never a number this file invented. */
type Value = string | undefined;

function declaration(property: string, value: Value): string {
  return value !== undefined && isSafeCssValue(value) ? `${property}: ${escapeHtml(value)}` : "";
}

function style(declarations: readonly string[]): string {
  const kept = declarations.filter((entry) => entry !== "");
  return kept.length > 0 ? ` style="${kept.join("; ")}"` : "";
}

const STEP_FRACTION = { small: 0.25, middle: 0.5, large: 1 } as const;

/**
 * Picks a step from a scale by position rather than by name, because a scale's
 * names are the project's own — `space-4` and `md` and `2` all mean the middle
 * of something. Position is the one thing every scale has.
 *
 * Proportional, not by fixed index: a fixed index made `small` and `middle`
 * land on the same step of a three-step scale, so the smallest value was never
 * used and two visibly different measurements came out identical.
 */
function step(values: readonly string[], position: keyof typeof STEP_FRACTION): Value {
  if (values.length === 0) {
    return undefined;
  }

  const last = values.length - 1;
  return values[Math.min(last, Math.floor(values.length * STEP_FRACTION[position]))];
}

function roleValue(roles: ResolvedRoles, name: RoleName): Value {
  return roles[name]?.value;
}

export interface ShowcaseResult {
  readonly html: string;
  /** Roles the section needed and did not get, so the demo can say why it is absent. */
  readonly missing: readonly RoleName[];
}

/**
 * One composite section — hero, cards, form — assembled from the design system
 * rather than from anything written here.
 *
 * The ladders above it show what a system contains; this shows whether it holds
 * together. Every colour, space and radius comes from a token, reached through
 * roles so the section works whatever the project calls its colours. Only
 * layout — how things sit next to each other — is written in the stylesheet,
 * since that is not the system's to decide.
 */
export function showcaseSection(tokens: ResolvedTokens): ShowcaseResult {
  const roles = tokens.roles ?? {};
  const missing = REQUIRED_ROLES.filter((name) => roles[name] === undefined);
  if (missing.length > 0) {
    return { html: "", missing };
  }

  const surface = roleValue(roles, "surface");
  const text = roleValue(roles, "text");
  const muted = roleValue(roles, "text-muted") ?? text;
  const primary = roleValue(roles, "primary");
  const onPrimary = roleValue(roles, "on-primary");

  // A fallback must never land on the colour of the thing it sits against.
  // Falling back to `surface` gave a system with only the required roles a
  // stage, cards and borders all the same colour: present in the markup,
  // invisible on screen. The stage simply goes without a background, letting
  // the page behind it show; the border borrows the text colour, which is the
  // one colour the system guarantees stands out against the surface.
  const surface2 = roleValue(roles, "surface-2");
  const border = roleValue(roles, "border") ?? text;
  // `danger` deliberately has no fallback: an error line borrowing the ordinary
  // text colour would look like a correct system rather than an unmapped role.
  const danger = roleValue(roles, "danger");

  const spacing = (tokens.spacing ?? []).map((token) => token.value);
  const radii = (tokens.radius ?? []).map((token) => token.value);
  const shadows = (tokens.shadow ?? []).map((token) => token.value);
  const type = tokens.typography ?? [];

  const gapSmall = step(spacing, "small");
  const gapMiddle = step(spacing, "middle");
  const gapLarge = step(spacing, "large");
  const radius = step(radii, "middle");
  const shadow = step(shadows, "middle");

  const heading = type[0];
  const body = type.find((entry) => ["body", "base", "text"].includes(entry.name.toLowerCase()));
  const caption = type.at(-1);

  const headingStyle = style([
    declaration("color", text),
    declaration("font-size", heading?.size),
    declaration("line-height", heading?.lineHeight),
    declaration("font-weight", heading?.weight),
    declaration("letter-spacing", heading?.letterSpacing),
    declaration("margin-bottom", gapSmall),
  ]);
  const leadStyle = style([
    declaration("color", muted),
    declaration("font-size", body?.size),
    declaration("line-height", body?.lineHeight),
    declaration("margin-bottom", gapMiddle),
  ]);
  const buttonStyle = style([
    declaration("background", primary),
    declaration("color", onPrimary),
    declaration("border-radius", radius),
    declaration("padding", gapSmall),
    declaration("font-size", body?.size),
  ]);
  const cardStyle = style([
    declaration("background", surface),
    declaration("border-color", border),
    declaration("border-radius", radius),
    declaration("padding", gapMiddle),
    declaration("box-shadow", shadow),
  ]);
  const cardTitleStyle = style([
    declaration("color", text),
    declaration("font-size", body?.size),
    declaration("margin-bottom", gapSmall),
  ]);
  const cardTextStyle = style([
    declaration("color", muted),
    declaration("font-size", caption?.size),
    declaration("line-height", caption?.lineHeight),
  ]);
  const fieldStyle = style([
    declaration("background", surface),
    declaration("border-color", border),
    declaration("border-radius", radius),
    declaration("padding", gapSmall),
    declaration("color", text),
    declaration("font-size", body?.size),
  ]);
  const labelStyle = style([
    declaration("color", text),
    declaration("font-size", caption?.size),
    declaration("margin-bottom", gapSmall),
  ]);
  const errorStyle = style([
    declaration("color", danger),
    declaration("font-size", caption?.size),
    declaration("margin-top", gapSmall),
  ]);
  const stageStyle = style([
    declaration("background", surface2),
    declaration("border-radius", radius),
    declaration("padding", gapLarge),
  ]);
  const panelStyle = style([
    declaration("background", surface),
    declaration("border-color", border),
    declaration("border-radius", radius),
    declaration("padding", gapMiddle),
  ]);

  const cards = [
    ["Vlastní tempo", "Nastavíte si, jak rychle chcete postupovat. Nic neběží bez vás."],
    ["Přehled na jednom místě", "Všechny smlouvy, platby a termíny v jediném seznamu."],
    ["Bez papírování", "Podepisujete online. Tiskárnu si necháte na jiné věci."],
  ]
    .map(
      ([title, body]) => `<article class="showcase__card"${cardStyle}>
          <h4 class="showcase__card-title"${cardTitleStyle}>${escapeHtml(title ?? "")}</h4>
          <p class="showcase__card-text"${cardTextStyle}>${escapeHtml(body ?? "")}</p>
        </article>`,
    )
    .join("\n        ");

  const html = `<div class="showcase"${stageStyle}>
      <div class="showcase__hero">
        <h3 class="showcase__heading"${headingStyle}>Účetnictví, které nezdržuje</h3>
        <p class="showcase__lead"${leadStyle}>Faktury, výkazy i přiznání na jednom místě — a upozornění dřív, než termín začne hořet.</p>
        <span class="showcase__button"${buttonStyle}>Vyzkoušet zdarma</span>
      </div>

      <div class="showcase__cards">
        ${cards}
      </div>

      <div class="showcase__form"${panelStyle}>
        <span class="showcase__label"${labelStyle}>Pracovní e-mail</span>
        <input class="showcase__field"${fieldStyle} type="text" value="jan.novak@" readonly disabled>
        <p class="showcase__error"${errorStyle}>Zadejte e-mail včetně domény.</p>
      </div>
    </div>`;

  return { html: section("showcase", "Ukázková sekce", html), missing: [] };
}
