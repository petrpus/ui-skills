import { JSDOM } from "jsdom";
import { serialize } from "./serialize.ts";
import { CX_ID_ATTRIBUTE, type ElementLocation, type Instrumented } from "./types.ts";

/**
 * Parsed with jsdom rather than a lighter parser, because the identifiers are
 * positional and a lighter parser does not build the tree a browser builds.
 * linkedom leaves head-level elements as siblings of `body`, which made `body`
 * the eighth child instead of the second: every selector below it was computed
 * against a document no browser would ever produce, and nineteen of twenty-one
 * matched nothing when a browser finally read them.
 *
 * Types come from the parser too — this package runs in Node and has no browser
 * globals.
 */
type Document = JSDOM["window"]["document"];
type Element = ReturnType<Document["createElement"]>;

interface Queryable {
  querySelectorAll(selector: string): Iterable<Element>;
}

/**
 * Elements that carry no content a reviewer could point at. They still exist in
 * the tree, so they still count for positions, but nobody comments on a `<meta>`.
 */
const SKIPPED = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "HEAD", "BASE"]);

/**
 * A declarative shadow root's template is consumed while the browser parses the
 * page — it becomes a real shadow root and the element itself is gone. Giving it
 * an identifier would promise something that resolves to nothing; what a
 * reviewer points at is inside it, reached through the host.
 */
function isShadowTemplate(element: Element): boolean {
  return element.tagName === "TEMPLATE" && element.hasAttribute("shadowrootmode");
}

/**
 * A fingerprint of the element's text, with whitespace collapsed.
 *
 * Collapsing matters: the serialiser minifies its output, so the same paragraph
 * differs from the original in indentation alone. Comparing raw text called an
 * identical page a mismatch.
 */
function fingerprint(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function elementChildren(parent: Element): Element[] {
  return Array.from(parent.childNodes).filter(
    (node): node is Element => (node as Element).nodeType === 1,
  );
}

function parentElement(element: Element): Element | null {
  const parent = element.parentNode as Element | null;
  return parent !== null && parent.nodeType === 1 ? parent : null;
}

function positionAmongSiblings(element: Element): number {
  const parent = parentElement(element);
  return parent === null ? 1 : elementChildren(parent).indexOf(element) + 1;
}

/**
 * A positional path from the document root.
 *
 * Positional rather than class-based on purpose: minified class names change
 * between builds, and a snapshot may be reviewed against a source tree that has
 * moved on. Position at least fails loudly.
 */
function selectorFor(element: Element, root: string): string {
  const steps: string[] = [];
  let current: Element | null = element;

  while (current !== null) {
    const tag = current.tagName.toLowerCase();
    steps.unshift(`${tag}:nth-child(${positionAmongSiblings(current)})`);
    current = parentElement(current);
  }

  return [root, ...steps].filter(Boolean).join(" > ");
}

function xpathFor(element: Element, root: string): string {
  const steps: string[] = [];
  let current: Element | null = element;

  while (current !== null) {
    const step: Element = current;
    const parent = parentElement(step);
    const sameTag =
      parent === null ? [step] : elementChildren(parent).filter((n) => n.tagName === step.tagName);
    steps.unshift(`${step.tagName.toLowerCase()}[${sameTag.indexOf(step) + 1}]`);
    current = parent;
  }

  return `${root}/${steps.join("/")}`;
}

/**
 * Declarative shadow roots, which is how the serialiser writes shadow DOM out.
 *
 * Their contents are real elements a reviewer will point at, and they are
 * invisible to `querySelectorAll` — a probe that skipped them reported a page
 * as having lost a fifth of its content when the content was simply inside.
 */
function shadowTemplates(root: Queryable): Element[] {
  return Array.from(root.querySelectorAll("template")).filter((template) =>
    template.hasAttribute("shadowrootmode"),
  );
}

interface Walk {
  readonly element: Element;
  /** Prefix identifying which tree the element lives in — the document, or a shadow root. */
  readonly root: string;
}

function walk(root: Queryable, rootPath: string): Walk[] {
  const found: Walk[] = [];

  for (const element of Array.from(root.querySelectorAll("*"))) {
    found.push({ element, root: rootPath });
  }

  for (const [index, template] of shadowTemplates(root).entries()) {
    const content = (template as Element & { content: Queryable }).content;
    found.push(...walk(content, `${rootPath}#shadow-${index}`));
  }

  return found;
}

/**
 * Gives every element in a snapshot a stable id and records where to find it.
 *
 * Pure: HTML in, HTML and a map out. Nothing here reads a file or a network, so
 * the identifiers can be tested without a browser and the same input always
 * produces the same ids — which matters, because a review refers to them after
 * the page they describe is gone.
 *
 * Runs over the snapshot, never over the original page. That is not a detail:
 * the serialiser removes scripts, so positions computed on the original do not
 * hold in the copy.
 */
export function instrument(html: string): Instrumented {
  const { document } = new JSDOM(html).window;
  const map: Record<string, ElementLocation> = Object.create(null);

  const elements = walk(document as unknown as Queryable, "").filter(
    ({ element }) => !SKIPPED.has(element.tagName) && !isShadowTemplate(element),
  );

  elements.forEach(({ element, root }, index) => {
    const id = `cx-${index}`;
    element.setAttribute(CX_ID_ATTRIBUTE, id);
    map[id] = {
      selector: selectorFor(element, root),
      xpath: xpathFor(element, root),
      textFingerprint: fingerprint(element),
    };
  });

  return {
    html: serialize(document),
    map,
    count: elements.length,
  };
}
