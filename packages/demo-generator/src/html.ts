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
 * Characters a colour, length or shadow value can be spelled with. An allowlist
 * rather than a list of banned characters, so the guard never rests on reasoning
 * about which exotic character a browser's CSS tokenizer happens to ignore —
 * fullwidth parens, for one, look like a function call to nobody and to nothing,
 * but proving that takes a walk through the CSS syntax spec.
 *
 * Deliberately excluded: quotes and colons (every URL scheme needs one),
 * backslashes (a CSS escape can spell a function name past a textual check),
 * braces and semicolons (they end the declaration).
 */
const ALLOWED_VALUE_CHARS = /^[a-z0-9 \t.,%#+*\/()_-]*$/i;

/**
 * Decides whether a token value may be inlined into a `style` attribute.
 *
 * Escaping is not enough here. HTML escaping stops the value from breaking out
 * of the attribute, but the browser still honours whatever CSS survives — and a
 * value that fetches a remote image turns a file whose whole promise is "opens
 * offline" into one that phones home.
 *
 * Refused, in order: any character outside the allowlist above, a CSS comment
 * opener (both of its characters are legal on their own), and finally any
 * function call whose name is not one a design token plausibly needs.
 */
export function isSafeCssValue(value: string): boolean {
  if (!ALLOWED_VALUE_CHARS.test(value) || value.includes("/*")) {
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
