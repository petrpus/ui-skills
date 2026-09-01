import { chromium } from "playwright";

/**
 * The slice of a CDP `DOM.getDocument` node this module reads. CDP's own
 * type carries dozens of fields; naming just these keeps the counting logic
 * testable without a browser.
 */
export interface CdpNode {
  readonly nodeName: string;
  readonly shadowRootType?: string;
  readonly children?: readonly CdpNode[];
  readonly shadowRoots?: readonly CdpNode[];
  readonly templateContent?: CdpNode;
  readonly contentDocument?: CdpNode;
}

/**
 * How many closed shadow roots a CDP DOM tree holds.
 *
 * Closed roots are the one thing the serialiser cannot see: it reads shadow
 * content through `host.shadowRoot`, which a closed root answers with null.
 * CDP's `DOM.getDocument` with `pierce: true` is the documented way past
 * that — DevTools sees closed roots because the browser itself does.
 * User-agent roots (a video element's controls, say) are the browser's own
 * furniture, not page content, so they do not count.
 */
export function countClosedShadowRoots(root: CdpNode): number {
  let count = root.shadowRootType === "closed" ? 1 : 0;

  for (const shadowRoot of root.shadowRoots ?? []) {
    count += countClosedShadowRoots(shadowRoot);
  }
  for (const child of root.children ?? []) {
    count += countClosedShadowRoots(child);
  }
  if (root.templateContent !== undefined) {
    count += countClosedShadowRoots(root.templateContent);
  }
  if (root.contentDocument !== undefined) {
    count += countClosedShadowRoots(root.contentDocument);
  }

  return count;
}

/**
 * Opens the page and asks the browser itself how many closed shadow roots it
 * built. A second page load beside the serialiser's own, and worth it: the
 * snapshot silently lacks that content, and a warning that names the loss
 * beats a reviewer trusting a copy with holes in it (#40). Capturing the
 * content instead of counting it means driving the browser ourselves — that
 * is #37, phase 1.
 */
/**
 * What both CLIs actually call: probes and turns the outcome into at most
 * one stderr line. Never throws — the snapshot is already on disk and the
 * review is about to start, and a failed *detection* must not turn a
 * delivered capture into a reported failure. A failed check is itself
 * named, not swallowed: silence has to mean "no closed roots".
 */
export async function reportClosedShadowRoots(
  url: string,
  probe: (url: string) => Promise<number> = probeClosedShadowRoots,
): Promise<string | null> {
  try {
    return closedShadowWarning(await probe(url));
  } catch (error) {
    return `⚠ zavřené shadow rooty se nepodařilo ověřit: ${(error as Error).message}`;
  }
}

/** The one Czech sentence both CLIs print, so the loss is named identically. */
export function closedShadowWarning(count: number): string | null {
  if (count === 0) {
    return null;
  }
  return count === 1
    ? "⚠ stránka má zavřený shadow root — jeho obsah ve snapshotu chybí a review ho nemůže vidět"
    : `⚠ stránka má ${count} zavřených shadow rootů — jejich obsah ve snapshotu chybí a review ho nemůže vidět`;
}

export async function probeClosedShadowRoots(url: string): Promise<number> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // The same budget the capture itself gets (--browser-load-max-time):
    // a page slow enough to need capture's full 60 s must not fail the
    // probe at playwright's 30 s default.
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    const session = await page.context().newCDPSession(page);
    const { root } = await session.send("DOM.getDocument", { depth: -1, pierce: true });
    return countClosedShadowRoots(root);
  } finally {
    await browser.close();
  }
}
