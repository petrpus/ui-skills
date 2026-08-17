import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { instrument } from "../src/instrument.ts";
import { CX_ID_ATTRIBUTE } from "../src/types.ts";

const page = `<!doctype html>
<html><head><title>Vzorek</title><style>p { color: red }</style></head>
<body>
  <header class="banner"><h1>Nadpis</h1><p>Odstavec v hlavičce.</p></header>
  <section>
    <article><h2>První</h2><p>Text jedna.</p></article>
    <article><h2>Druhá</h2><p>Text dvě.</p></article>
  </section>
  <img src="data:image/gif;base64,R0lGOD" alt="">
</body></html>`;

/**
 * Resolves a recorded selector back to an element, the way apply-review will.
 *
 * Only the selector: linkedom has no xpath engine, so the xpath is asserted on
 * its shape here and actually resolved by a browser in the end-to-end test.
 */
function resolveSelector(html: string, selector: string) {
  return new JSDOM(html).window.document.querySelectorAll(selector);
}

describe("instrument", () => {
  it("gives every content element an id", () => {
    const { html, count } = instrument(page);
    const { document } = new JSDOM(html).window;

    expect(count).toBeGreaterThan(0);
    expect(document.querySelectorAll(`[${CX_ID_ATTRIBUTE}]`).length).toBe(count);
  });

  it("hands out unique ids", () => {
    const { map } = instrument(page);

    expect(new Set(Object.keys(map)).size).toBe(Object.keys(map).length);
  });

  it("assigns the same ids to the same input every time", () => {
    expect(instrument(page).map).toEqual(instrument(page).map);
  });

  it("leaves the page's own content alone apart from the attribute", () => {
    const { html } = instrument(page);

    expect(html).toContain("Odstavec v hlavičce.");
    expect(html).toContain("Text dvě.");
  });

  it("does not instrument elements nobody can point at", () => {
    const { html } = instrument(page);
    const { document } = new JSDOM(html).window;

    expect(document.querySelector("style")?.hasAttribute(CX_ID_ATTRIBUTE)).toBe(false);
    expect(document.querySelector("title")?.hasAttribute(CX_ID_ATTRIBUTE)).toBe(false);
  });

  describe("the selector it records", () => {
    it("finds exactly one element, and the right one", () => {
      const { html, map } = instrument(page);

      for (const [id, location] of Object.entries(map)) {
        const found = resolveSelector(html, location.selector);

        expect(found.length, `${id}: ${location.selector}`).toBe(1);
        expect(found[0]?.getAttribute(CX_ID_ATTRIBUTE)).toBe(id);
      }
    });
  });

  describe("the xpath it records", () => {
    it("has a positional step for every level", () => {
      const { map } = instrument(page);
      const entry = Object.values(map).find((location) => location.textFingerprint === "Text dvě.");

      expect(entry?.xpath).toMatch(/^(\/[A-Za-z]+\[\d+\])+$/);
    });

    it("differs between two elements that share a tag and a parent", () => {
      const { map } = instrument(page);
      const articles = Object.values(map).filter(
        (location) =>
          location.xpath?.endsWith("article[1]") === true ||
          location.xpath?.endsWith("article[2]") === true,
      );

      expect(new Set(articles.map((location) => location.xpath)).size).toBe(articles.length);
    });
  });

  describe("the text fingerprint it records", () => {
    it("matches the element's own text", () => {
      const { map } = instrument(page);
      const fingerprints = Object.values(map).map((location) => location.textFingerprint);

      expect(fingerprints).toContain("Text jedna.");
      expect(fingerprints).toContain("Nadpis");
    });

    it("collapses whitespace, because the serialiser minifies", () => {
      const { map } = instrument("<html><body><p>první\n   řádek\t a\n\ndruhý</p></body></html>");
      const paragraph = Object.values(map).find((location) =>
        location.textFingerprint.includes("první"),
      );

      expect(paragraph?.textFingerprint).toBe("první řádek a druhý");
    });

    it("is empty for an element with no text, rather than absent", () => {
      const { map } = instrument(page);
      const image = Object.values(map).find((location) => location.xpath?.includes("img") === true);

      expect(image?.textFingerprint).toBe("");
    });

    it("truncates a very long text rather than carrying a whole page", () => {
      const long = "slovo ".repeat(200);
      const { map } = instrument(`<html><body><p>${long}</p></body></html>`);
      const paragraph = Object.values(map).find((location) =>
        location.textFingerprint.startsWith("slovo"),
      );

      expect(paragraph?.textFingerprint.length).toBeLessThanOrEqual(120);
    });
  });

  describe("shadow roots", () => {
    const withShadow = `<html><body>
      <div id="host"><template shadowrootmode="open">
        <p>Odstavec ve stínovém stromu.</p>
      </template></div>
      <p>Odstavec ve světle.</p>
    </body></html>`;

    it("instruments what is inside them too", () => {
      const { map } = instrument(withShadow);
      // Matched on the identifier's tree, not on the text: the host element's
      // own textContent includes what the template holds, so searching by text
      // finds the host first and would pass without the shadow being walked.
      const shadowed = Object.values(map).filter((location) => location.hostPath.length > 0);

      expect(shadowed.map((location) => location.textFingerprint)).toContain(
        "Odstavec ve stínovém stromu.",
      );
    });

    it("records the hosts to open, and no xpath, since neither can cross a shadow boundary", () => {
      const { map } = instrument(withShadow);
      const shadowed = Object.values(map).filter((location) => location.hostPath.length > 0);

      expect(shadowed.length).toBeGreaterThan(0);
      for (const location of shadowed) {
        expect(location.hostPath[0]).toContain("div:nth-child(1)");
        expect(location.selector).not.toContain("#shadow-");
        expect(location.xpath).toBeUndefined();
      }
    });

    it("keeps light and shadow elements apart", () => {
      const { map } = instrument(withShadow);
      const light = Object.values(map).find(
        (location) => location.textFingerprint === "Odstavec ve světle.",
      );

      expect(light?.hostPath).toEqual([]);
      expect(light?.xpath).toBeDefined();
    });
  });

  it("copes with an empty document without inventing elements", () => {
    const { map, count } = instrument("<html><body></body></html>");

    expect(count).toBe(Object.keys(map).length);
  });
});

describe("elements a browser will not keep", () => {
  const withShadow = `<html><body>
    <div id="host"><template shadowrootmode="open"><p>uvnitř</p></template></div>
  </body></html>`;

  it("does not identify a declarative shadow template", () => {
    // The browser consumes it while parsing: it becomes a shadow root and the
    // element is gone, so an identifier for it would resolve to nothing.
    const { map } = instrument(withShadow);
    const templates = Object.values(map).filter((location) =>
      location.selector.endsWith("template:nth-child(1)"),
    );

    expect(templates).toEqual([]);
  });

  it("still identifies what is inside it", () => {
    const { map } = instrument(withShadow);
    const shadowed = Object.values(map).filter((location) => location.hostPath.length > 0);

    expect(shadowed.map((location) => location.textFingerprint)).toContain("uvnitř");
  });

  it("keeps an ordinary template, which does survive parsing", () => {
    const { map } = instrument("<html><body><template><p>šablona</p></template></body></html>");
    const templates = Object.values(map).filter((location) =>
      location.selector.includes("template"),
    );

    expect(templates.length).toBeGreaterThan(0);
  });
});

describe("a closed shadow root", () => {
  const closed = `<html><body>
    <div id="host"><template shadowrootmode="closed"><p>uvnitř zavřeného</p></template></div>
  </body></html>`;

  it("is opened, because a closed one answers with null to whoever follows an identifier", () => {
    const { html } = instrument(closed);

    expect(html).toContain('shadowrootmode="open"');
    expect(html).not.toContain('shadowrootmode="closed"');
  });

  it("has its content identified like any other", () => {
    const { map } = instrument(closed);
    const shadowed = Object.values(map).filter((location) => location.hostPath.length > 0);

    expect(shadowed.map((location) => location.textFingerprint)).toContain("uvnitř zavřeného");
  });

  it("leaves an already open root alone", () => {
    const { html } = instrument(
      '<html><body><div><template shadowrootmode="open"><p>ahoj</p></template></div></body></html>',
    );

    expect(html).toContain('shadowrootmode="open"');
  });
});
