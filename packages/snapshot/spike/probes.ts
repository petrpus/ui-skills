import type { Page } from "playwright";

/**
 * The checks the spike runs, written as functions evaluated inside the page.
 *
 * Each answers one of the four criteria from issue #2 with a measurement rather
 * than an impression, because the decision they feed — SingleFile or a
 * stylesheet-preserving engine of our own — is worth weeks either way.
 */

const SENTINEL = "rgb(1, 2, 3)";

/** Every custom property declared by a stylesheet the page will let us read. */
export async function declaredCustomProperties(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const names = new Set<string>();

    const visit = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          for (const property of Array.from(rule.style)) {
            if (property.startsWith("--")) {
              names.add(property);
            }
          }
        } else if ("cssRules" in rule) {
          visit((rule as CSSGroupingRule).cssRules);
        }
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        visit(sheet.cssRules);
      } catch {
        // A cross-origin stylesheet refuses to be read. Not a failure of the
        // snapshot — just something this probe cannot see from here.
      }
    }
    return [...names];
  });
}

export interface OverrideResult {
  readonly property: string;
  /** How many elements changed colour when the property was reassigned. */
  readonly affected: number;
}

/**
 * Criterion (a). A property being present says nothing; what matters is whether
 * reassigning it repaints anything, which is what a CSS panel would need.
 *
 * Works by setting the property to a colour no design uses and counting the
 * elements whose computed colour or background becomes it.
 */
export async function overridableProperties(
  page: Page,
  properties: readonly string[],
): Promise<OverrideResult[]> {
  return page.evaluate(
    ([names, sentinel]) => {
      const results: { property: string; affected: number }[] = [];
      const root = document.documentElement;

      for (const property of names as string[]) {
        const previous = root.style.getPropertyValue(property);
        root.style.setProperty(property, sentinel as string);

        let affected = 0;
        for (const element of Array.from(document.querySelectorAll("*"))) {
          const style = getComputedStyle(element);
          if (style.color === sentinel || style.backgroundColor === sentinel) {
            affected += 1;
          }
        }

        if (previous === "") {
          root.style.removeProperty(property);
        } else {
          root.style.setProperty(property, previous);
        }
        results.push({ property, affected });
      }
      return results;
    },
    [properties, SENTINEL] as const,
  );
}

export interface ViewportSample {
  readonly narrowMatches: boolean;
  readonly wideMatches: boolean;
  readonly changedElements: number;
}

/**
 * Criterion (b). Media queries are only alive if the layout actually answers to
 * the viewport, so this compares computed styles at two widths rather than
 * trusting `matchMedia` alone.
 */
export async function respondsToViewport(page: Page, query: string): Promise<ViewportSample> {
  const sampleAt = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    return page.evaluate(
      (mediaQuery) => ({
        matches: window.matchMedia(mediaQuery).matches,
        styles: Array.from(document.querySelectorAll("*")).map((element) => {
          const style = getComputedStyle(element);
          return `${style.gridTemplateColumns}|${style.backgroundColor}|${style.display}`;
        }),
      }),
      query,
    );
  };

  const wide = await sampleAt(1280);
  const narrow = await sampleAt(400);
  const changed = wide.styles.filter((value, index) => value !== narrow.styles[index]).length;

  return {
    wideMatches: wide.matches,
    narrowMatches: narrow.matches,
    changedElements: changed,
  };
}

export interface SelectorSample {
  readonly selector: string;
  readonly tag: string;
  readonly text: string;
}

/** A spread of elements with a positional selector each, for criterion (c). */
export async function sampleSelectors(page: Page, count: number): Promise<SelectorSample[]> {
  return page.evaluate((wanted) => {
    const selectorFor = (element: Element): string => {
      const parts: string[] = [];
      let current: Element | null = element;

      while (current !== null && current !== document.documentElement) {
        const parent: Element | null = current.parentElement;
        if (parent === null) {
          break;
        }
        const index = Array.from(parent.children).indexOf(current) + 1;
        parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
        current = parent;
      }
      return `html > ${parts.join(" > ")}`;
    };

    const all = Array.from(document.querySelectorAll("body *"));
    const step = Math.max(1, Math.floor(all.length / wanted));
    const picked = all.filter((_, index) => index % step === 0).slice(0, wanted);

    return picked.map((element) => ({
      selector: selectorFor(element),
      tag: element.tagName.toLowerCase(),
      text: (element.textContent ?? "").trim().slice(0, 40),
    }));
  }, count);
}

export interface SelectorVerdict {
  readonly matched: number;
  readonly wrongElement: number;
  readonly missing: number;
}

/** Criterion (c): do the original's selectors still find the same elements? */
export async function checkSelectors(
  page: Page,
  samples: readonly SelectorSample[],
): Promise<SelectorVerdict> {
  return page.evaluate((entries) => {
    let matched = 0;
    let wrongElement = 0;
    let missing = 0;

    for (const entry of entries) {
      let found: Element | null = null;
      try {
        found = document.querySelector(entry.selector);
      } catch {
        found = null;
      }

      if (found === null) {
        missing += 1;
      } else if (
        found.tagName.toLowerCase() === entry.tag &&
        (found.textContent ?? "").trim().slice(0, 40) === entry.text
      ) {
        matched += 1;
      } else {
        wrongElement += 1;
      }
    }
    return { matched, wrongElement, missing };
  }, samples as SelectorSample[]);
}

/**
 * The content elements in document order, ignoring the ones a serialiser is
 * expected to add or drop.
 *
 * Carrying a positional selector from the original into the copy fails for a
 * boring reason: removing a script shifts every `nth-child` after it. What
 * instrumentation actually needs is that the *content* still corresponds, so
 * that walking the copy finds the same elements in the same order — the ids are
 * assigned to the copy afterwards, not carried into it.
 *
 * Whitespace is collapsed before comparing: the serialiser minifies its output,
 * so indentation inside an element's text differs everywhere without a single
 * element having moved.
 */
export async function contentOutline(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const ignored = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "NOSCRIPT"]);
    return Array.from(document.querySelectorAll("body *"))
      .filter((element) => !ignored.has(element.tagName))
      .map((element) => {
        const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
        return `${element.tagName.toLowerCase()}:${text}`;
      });
  });
}

/** Criterion (d): how much of the original page is still alive in the copy. */
export async function countScripts(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll("script").length);
}

export async function countMutations(page: Page, milliseconds: number): Promise<number> {
  return page.evaluate(async (duration) => {
    let seen = 0;
    const observer = new MutationObserver((records) => {
      seen += records.length;
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    await new Promise((resolve) => setTimeout(resolve, duration));
    observer.disconnect();
    return seen;
  }, milliseconds);
}
