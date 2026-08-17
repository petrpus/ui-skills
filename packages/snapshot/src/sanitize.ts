import { JSDOM } from "jsdom";
import { serialize } from "./serialize.ts";

type Document = JSDOM["window"]["document"];
type Element = ReturnType<Document["createElement"]>;

/** Attributes a browser will navigate to or fetch if we let it. */
const URL_ATTRIBUTES = ["href", "src", "action", "formaction", "xlink:href", "data", "ping"];

/**
 * Schemes that execute rather than fetch. `data:text/html` is here because a
 * document loaded from one runs its own scripts.
 */
const EXECUTABLE_SCHEME = /^\s*(javascript|vbscript|data:text\/html)/i;

/**
 * The value as the browser will read it, not as it was written.
 *
 * A URL parser removes every ASCII tab, newline and carriage return before it
 * looks at the scheme, so `java\nscript:` is `javascript:` by the time anything
 * is decided — and a filter that only trimmed the ends let it straight through
 * to a link that fired when clicked.
 */
function asBrowserReads(value: string): string {
  return value.replace(/[\t\n\r]/g, "");
}

function neutraliseUrls(element: Element): number {
  let removed = 0;

  for (const name of URL_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value !== null && EXECUTABLE_SCHEME.test(asBrowserReads(value))) {
      element.removeAttribute(name);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Stops a frame from running anything while leaving what it shows.
 *
 * The serialiser inlines frames as `srcdoc`, so their content is part of the
 * page under review and deleting it would lose real content. An empty `sandbox`
 * takes away scripts, forms, popups and same-origin access, which is everything
 * that made the frame dangerous — a `srcdoc` frame carrying a script runs it on
 * load, with no interaction, and can reach the page that holds it.
 */
function sandboxFrames(document: Document): number {
  let changed = 0;

  for (const frame of Array.from(document.querySelectorAll("iframe, frame")) as Element[]) {
    if (frame.getAttribute("sandbox") !== "") {
      frame.setAttribute("sandbox", "");
      changed += 1;
    }
  }
  return changed;
}

/**
 * Strips anything that could still run in a copy that is about to be served
 * from localhost.
 *
 * The spike found the serialiser leaves nothing running — but "nothing running
 * once loaded" is not the same as "nothing that can run". Its own bootstrap
 * script removes itself after attaching shadow roots, and a captured page can
 * bring `javascript:` links and framed documents of its own. The copy is served
 * as a local origin, so anything left executable would be someone else's code
 * with our permissions.
 */
export function sanitize(html: string): { html: string; removed: number } {
  const { document } = new JSDOM(html).window;
  let removed = 0;

  // Matches SVG's script element too: both have the local name `script`.
  for (const script of Array.from(document.querySelectorAll("script")) as Element[]) {
    script.remove();
    removed += 1;
  }

  for (const element of Array.from(document.querySelectorAll("*")) as Element[]) {
    for (const attribute of Array.from(element.attributes) as { name: string }[]) {
      if (/^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name);
        removed += 1;
      }
    }
    removed += neutraliseUrls(element);
  }

  removed += sandboxFrames(document);

  return { html: serialize(document), removed };
}
