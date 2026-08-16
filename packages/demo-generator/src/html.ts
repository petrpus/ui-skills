const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * CSS functions a token value may legitimately use. Anything outside this set is
 * refused, so a function that fetches a resource cannot reach the page even when
 * nobody thought to name it: `url()` was the obvious one, but `image-set()` and
 * `-webkit-image-set()` take a bare string as a URL and need no `url()` token at
 * all. Naming the safe forms is finite; naming the dangerous ones is not.
 */
const ALLOWED_CSS_FUNCTIONS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
  "var",
  "calc",
  "clamp",
  "min",
  "max",
]);

const FUNCTION_CALL = /(-{0,2}[a-z][a-z0-9-]*)\s*\(/gi;

/**
 * Decides whether a token value may be inlined into a `style` attribute.
 *
 * Escaping is not enough here. HTML escaping stops the value from breaking out
 * of the attribute, but the browser still honours whatever CSS survives — and a
 * value that fetches a remote image turns a file whose whole promise is "opens
 * offline" into one that phones home.
 *
 * Refused, in order: anything that could end the declaration or open a comment;
 * backslashes, because a CSS escape can spell a function name past any textual
 * check (`\75 rl(…)` is `url(…)`); quotes, which the string-argument fetchers
 * depend on; colons, which every URL scheme needs; and finally any function call
 * outside the allowlist above.
 */
export function isSafeCssValue(value: string): boolean {
  if (/[{};:\\]|<\/|\/\*|["']/.test(value)) {
    return false;
  }

  for (const [, name] of value.matchAll(FUNCTION_CALL)) {
    if (name === undefined || !ALLOWED_CSS_FUNCTIONS.has(name.toLowerCase())) {
      return false;
    }
  }

  return true;
}

export function section(name: string, title: string, body: string): string {
  return `<section class="section" data-demo-section="${escapeHtml(name)}">
  <h2 class="section__title">${escapeHtml(title)}</h2>
  ${body}
</section>`;
}
