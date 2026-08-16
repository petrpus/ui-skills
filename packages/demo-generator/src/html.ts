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
 * Values reach the page as CSS, so anything that could close a declaration and
 * start a new rule is refused rather than escaped — a token value has no reason
 * to contain braces, semicolons or comment markers.
 *
 * `url()` is refused outright, including data URIs. Escaping does nothing about
 * it: the browser fetches whatever it points at, which would put a live external
 * request into a file whose whole promise is that it opens offline. A colour has
 * no reason to be a URL, and if a later token type genuinely needs a data URI,
 * relaxing this needs its own decision rather than an accidental hole.
 */
export function isSafeCssValue(value: string): boolean {
  return !/[{};]|<\/|\/\*|url\s*\(/i.test(value);
}

export function section(name: string, title: string, body: string): string {
  return `<section class="section" data-demo-section="${escapeHtml(name)}">
  <h2 class="section__title">${escapeHtml(title)}</h2>
  ${body}
</section>`;
}
