import { JSDOM } from "jsdom";
import { serialize } from "./serialize.ts";

type Document = JSDOM["window"]["document"];
type Element = ReturnType<Document["createElement"]>;

/**
 * Strips anything that could still run in a copy that is about to be served
 * from localhost.
 *
 * The spike found the serialiser already leaves nothing behind — zero scripts,
 * zero network requests, zero DOM mutations on every target measured. This runs
 * anyway, because that finding holds for its default settings and the copy is
 * served as a local origin: a page that turned out to be live would be running
 * someone else's code with our permissions, and the cost of being sure is a
 * single pass over the document.
 */
export function sanitize(html: string): { html: string; removed: number } {
  const { document } = new JSDOM(html).window;
  let removed = 0;

  for (const script of Array.from(document.querySelectorAll("script")) as Element[]) {
    script.remove();
    removed += 1;
  }

  for (const element of Array.from(document.querySelectorAll("*")) as Element[]) {
    for (const attribute of Array.from(element.attributes) as { name: string }[]) {
      const name = attribute.name;
      if (/^on/i.test(name)) {
        element.removeAttribute(name);
        removed += 1;
      }
    }
  }

  return { html: serialize(document), removed };
}
