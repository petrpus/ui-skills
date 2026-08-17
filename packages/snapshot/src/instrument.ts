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

function elementChildren(parent: { childNodes: ArrayLike<unknown> }): Element[] {
  return Array.from(parent.childNodes).filter(
    (node): node is Element => (node as Element).nodeType === 1,
  );
}

function parentElement(element: Element): Element | null {
  const parent = element.parentNode as Element | null;
  return parent !== null && parent.nodeType === 1 ? parent : null;
}

/**
 * Counted among all element siblings, whatever holds them.
 *
 * The parent of a shadow root's top-level element is a fragment, not an
 * element. Asking for a parent *element* returned nothing there, so every such
 * element was called the first child — and a stylesheet sitting ahead of it in
 * the shadow root made that wrong, silently, for exactly the elements a
 * reviewer reaches through a host.
 */
function positionAmongSiblings(element: Element): number {
  const parent = element.parentNode as { childNodes: ArrayLike<unknown> } | null;
  return parent === null ? 1 : elementChildren(parent).indexOf(element) + 1;
}

/**
 * A positional path from the document root.
 *
 * Positional rather than class-based on purpose: minified class names change
 * between builds, and a snapshot may be reviewed against a source tree that has
 * moved on. Position at least fails loudly.
 */
function selectorFor(element: Element): string {
  const steps: string[] = [];
  let current: Element | null = element;

  while (current !== null) {
    const tag = current.localName.toLowerCase();
    steps.unshift(`${tag}:nth-child(${positionAmongSiblings(current)})`);
    current = parentElement(current);
  }

  return steps.join(" > ");
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/**
 * One step of an xpath, written so a browser can actually resolve it.
 *
 * `document.evaluate` with no namespace resolver matches an unprefixed name
 * only against elements in no namespace. Browsers special-case HTML into that;
 * SVG and MathML never qualify, whatever their case — so `svg[1]` selects
 * nothing, and so does every step below it. Foreign elements are therefore
 * matched on their local name instead, which ignores the namespace entirely.
 */
function xpathStep(element: Element, index: number): string {
  const isHtml = element.namespaceURI === null || element.namespaceURI === HTML_NAMESPACE;
  return isHtml
    ? `${element.localName}[${index}]`
    : `*[local-name()='${element.localName}'][${index}]`;
}

function xpathFor(element: Element): string {
  const steps: string[] = [];
  let current: Element | null = element;

  while (current !== null) {
    const step: Element = current;
    const parent = parentElement(step);
    const holder = (step.parentNode as { childNodes: ArrayLike<unknown> } | null) ?? null;
    const sameName =
      holder === null
        ? [step]
        : elementChildren(holder).filter((sibling) => sibling.localName === step.localName);
    steps.unshift(xpathStep(step, sameName.indexOf(step) + 1));
    current = parent;
  }

  return `/${steps.join("/")}`;
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

/**
 * Opens a closed shadow root, so what it holds can be pointed at.
 *
 * A closed root answers `host.shadowRoot` with null to everyone outside it,
 * which is precisely the step by which an identifier is followed, so content
 * inside one would carry identifiers that could never resolve.
 *
 * Nothing can observe the change. The mode governs script access and not
 * rendering, and this copy runs no script at all — the encapsulation would be
 * protecting a component that no longer exists from code that cannot run.
 *
 * A capture never reaches this today, and that was worth measuring rather than
 * assuming: the serialiser reads shadow content through the same null-returning
 * property, so a closed root's content is missing from the snapshot instead of
 * present and unaddressable. This stands for HTML arriving some other way, and
 * so that a serialiser which one day can read closed roots — see #40 — does not
 * hand back identifiers nobody can follow.
 */
function openShadowRoot(template: Element): void {
  if (template.getAttribute("shadowrootmode") === "closed") {
    template.setAttribute("shadowrootmode", "open");
  }
}

interface Walk {
  readonly element: Element;
  /** Hosts to open before this element's own selector applies, outermost first. */
  readonly hostPath: readonly string[];
}

function walk(root: Queryable, hostPath: readonly string[]): Walk[] {
  const found: Walk[] = [];

  for (const element of Array.from(root.querySelectorAll("*"))) {
    found.push({ element, hostPath });
  }

  for (const template of shadowTemplates(root)) {
    openShadowRoot(template);
    const host = parentElement(template);
    if (host === null) {
      continue;
    }
    const content = (template as Element & { content: Queryable }).content;
    found.push(...walk(content, [...hostPath, selectorFor(host)]));
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

  const elements = walk(document as unknown as Queryable, []).filter(
    ({ element }) => !SKIPPED.has(element.tagName) && !isShadowTemplate(element),
  );

  elements.forEach(({ element, hostPath }, index) => {
    const id = `cx-${index}`;
    element.setAttribute(CX_ID_ATTRIBUTE, id);
    map[id] = {
      selector: selectorFor(element),
      hostPath,
      // Only for the document tree: document.evaluate cannot enter a shadow
      // root, and an expression that throws is worse than one that is absent.
      ...(hostPath.length === 0 ? { xpath: xpathFor(element) } : {}),
      textFingerprint: fingerprint(element),
    };
  });

  return {
    html: serialize(document),
    map,
    count: elements.length,
  };
}
