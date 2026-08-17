import type { Page } from "playwright";

/**
 * The checks the spike runs, written as functions evaluated inside the page.
 *
 * Each answers one of the four criteria from issue #2 with a measurement rather
 * than an impression, because the decision they feed — SingleFile or a
 * stylesheet-preserving engine of our own — is worth weeks either way.
 */

const SENTINEL = "rgb(1, 2, 3)";

/**
 * Enough of the computed style to notice a token doing anything at all.
 *
 * An earlier version compared only `color` and `backgroundColor` against the
 * sentinel by string equality, which asked "did this token paint this exact
 * colour" instead of "did this token change anything". It reported zero live
 * tokens on a design system that composes colours from channels
 * (`rgb(var(--x-channel) / 40%)`) — on the live page, not even a snapshot — and
 * it could never see a spacing, radius or shadow token at all.
 */
const FINGERPRINT = [
  "color",
  "backgroundColor",
  "borderColor",
  "borderRadius",
  "boxShadow",
  "padding",
  "margin",
  "gap",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "fill",
  "stroke",
  "width",
  "height",
] as const;

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
 * reassigning it changes what the page renders, which is what a CSS panel needs.
 *
 * Measures by fingerprinting every element's computed style, reassigning the
 * property, and counting how many fingerprints moved. Deliberately indifferent
 * to *what* changed: a token feeding a shadow, a gap or a colour channel counts
 * the same as one feeding a plain colour, and a value the browser then rejects
 * counts too — the point is only that the property is wired to something.
 */
export async function overridableProperties(
  page: Page,
  properties: readonly string[],
): Promise<OverrideResult[]> {
  return page.evaluate(
    ([names, sentinel, fingerprint]) => {
      const properties = fingerprint as unknown as string[];
      const snapshot = (): string[] =>
        Array.from(document.querySelectorAll("*")).map((element) => {
          const style = getComputedStyle(element) as unknown as Record<string, string>;
          return properties.map((name) => style[name] ?? "").join("|");
        });

      const results: { property: string; affected: number }[] = [];
      const root = document.documentElement;
      const before = snapshot();

      for (const property of names as string[]) {
        const previous = root.style.getPropertyValue(property);
        root.style.setProperty(property, sentinel as string);

        const after = snapshot();
        const affected = before.filter((value, index) => value !== after[index]).length;

        if (previous === "") {
          root.style.removeProperty(property);
        } else {
          root.style.setProperty(property, previous);
        }
        results.push({ property, affected });
      }
      return results;
    },
    [properties, SENTINEL, FINGERPRINT] as const,
  );
}

/**
 * The custom properties the page actually reads somewhere, as opposed to merely
 * declaring.
 *
 * Sampling the first dozen declared properties made the criterion's outcome
 * depend on the order a stylesheet happens to be written in: on one design
 * system the first twelve were all shadows and spacing, none of which the old
 * probe could see, and the criterion failed for a reason that had nothing to do
 * with the snapshot.
 */
export async function referencedCustomProperties(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const names = new Set<string>();
    const pattern = /var\(\s*(--[a-zA-Z0-9_-]+)/g;

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          for (const match of Array.from(rule.cssText.matchAll(pattern))) {
            const name = match[1];
            if (name !== undefined) {
              names.add(name);
            }
          }
        }
      } catch {
        // Cross-origin stylesheet; nothing to read from here.
      }
    }
    return [...names];
  });
}

export interface ViewportSample {
  readonly narrowMatches: boolean;
  readonly wideMatches: boolean;
  readonly changedElements: number;
  /**
   * How many elements are hidden at each width. Counting elements whose whole
   * style fingerprint moved compares badly across a copy that has fewer
   * elements than the original; a count of what is displayed does not, and
   * showing and hiding is what a responsive layout mostly does.
   */
  readonly hiddenWide: number;
  readonly hiddenNarrow: number;
}

/**
 * Criterion (b). Media queries are only alive if the layout actually answers to
 * the viewport, so this compares computed styles at two widths rather than
 * trusting `matchMedia` alone.
 *
 * Measured wide → narrow → wide, counting only elements that changed one way
 * and changed back. Comparing two samples alone credits the viewport with
 * everything that happened between them, and on a page still settling that is
 * most of it: this probe once reported 265 elements responding on a page where
 * the honest number was ten, which made the snapshot look like it had lost
 * almost all of its responsiveness when it had lost about a third.
 */
export async function respondsToViewport(page: Page, query: string): Promise<ViewportSample> {
  const sampleAt = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    return page.evaluate((mediaQuery) => {
      const elements = Array.from(document.querySelectorAll("*"));
      return {
        matches: window.matchMedia(mediaQuery).matches,
        hidden: elements.filter((element) => getComputedStyle(element).display === "none").length,
        styles: elements.map((element) => {
          const style = getComputedStyle(element);
          return `${style.gridTemplateColumns}|${style.backgroundColor}|${style.display}`;
        }),
      };
    }, query);
  };

  const wide = await sampleAt(1280);
  const narrow = await sampleAt(400);
  const wideAgain = await sampleAt(1280);
  const changed = wide.styles.filter(
    (value, index) => value !== narrow.styles[index] && value === wideAgain.styles[index],
  ).length;

  return {
    wideMatches: wide.matches,
    narrowMatches: narrow.matches,
    changedElements: changed,
    hiddenWide: wide.hidden,
    hiddenNarrow: narrow.hidden,
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
