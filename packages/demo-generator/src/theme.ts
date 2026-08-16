import type { ResolvedToken, ResolvedTokens } from "@ui-skills/schema";
import { isSafeCssValue } from "./html.ts";

/**
 * A CSS custom property name derived from the token's own qualified name, so any
 * part of the renderer can work it out without being handed a registry.
 *
 * Anything outside the safe alphabet is escaped by code point rather than
 * replaced, because replacing would let `a b` and `a-b` land on the same
 * property and quietly share a value.
 */
export function tokenVar(token: ResolvedToken): string {
  // The one dot in a qualified name separates group from token — names may not
  // contain dots — so it becomes a hyphen and reads as a name rather than as an
  // escape sequence. Group names carry no hyphens, so the two halves cannot be
  // confused for one another.
  const separator = token.qualifiedName.indexOf(".");
  const group = token.qualifiedName.slice(0, separator);
  const name = token.qualifiedName.slice(separator + 1);
  const safe = name.replace(
    /[^a-zA-Z0-9-]/g,
    (char) => `_${char.codePointAt(0)?.toString(16) ?? "0"}`,
  );
  return `--t-${group}-${safe}`;
}

/**
 * What to write where the token's value is wanted.
 *
 * A token that looks the same in both modes is written out directly — no
 * indirection to read past, and no variable to look up. Only one that actually
 * changes becomes a variable, because only then is there something to switch.
 */
export function tokenCss(token: ResolvedToken): string {
  return token.dark === undefined ? token.value : `var(${tokenVar(token)})`;
}

function allTokens(tokens: ResolvedTokens): readonly ResolvedToken[] {
  return [
    ...(tokens.color ?? []),
    ...(tokens.spacing ?? []),
    ...(tokens.radius ?? []),
    ...(tokens.shadow ?? []),
  ];
}

export interface ThemeStyles {
  /** Empty when nothing changes between modes, so no toggle gets offered. */
  readonly css: string;
  readonly hasDark: boolean;
}

/**
 * The two faces of every token that has them, as custom properties.
 *
 * Unsafe values never make it into the stylesheet. The markup still says
 * `var(--t-…)`, which then resolves to nothing and drops the declaration — the
 * same outcome as inlining a refused value, reached the same way.
 */
export function themeStyles(tokens: ResolvedTokens): ThemeStyles {
  const switching = allTokens(tokens).filter((token) => token.dark !== undefined);
  if (switching.length === 0) {
    return { css: "", hasDark: false };
  }

  const light = switching
    .filter((token) => isSafeCssValue(token.value))
    .map((token) => `  ${tokenVar(token)}: ${token.value};`)
    .join("\n");

  const dark = switching
    .filter((token) => token.dark !== undefined && isSafeCssValue(token.dark))
    .map((token) => `  ${tokenVar(token)}: ${token.dark};`)
    .join("\n");

  return {
    css: `:root {\n${light}\n}\n\nhtml:has(#theme-dark:checked) {\n${dark}\n}`,
    hasDark: true,
  };
}

/**
 * The switch itself: a checkbox and a label, styled to look like a control.
 *
 * No JavaScript. The demo is a file people open from a mail attachment, and
 * keeping it script-free is worth more than supporting browsers without `:has`,
 * which have been the minority for years. A browser that ignores the selector
 * shows the light mode and a switch that does nothing, rather than a broken page.
 */
export const THEME_TOGGLE = `<input class="theme__input" id="theme-dark" type="checkbox">
  <label class="theme" for="theme-dark">
    <span class="theme__track"><span class="theme__knob"></span></span>
    <span class="theme__label">Tmavý režim</span>
  </label>`;
