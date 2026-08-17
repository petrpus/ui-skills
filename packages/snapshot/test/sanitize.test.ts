import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { sanitize } from "../src/sanitize.ts";

describe("sanitize", () => {
  it("removes a script the serialiser left behind", () => {
    const { html, removed } = sanitize(
      "<html><body><p>ahoj</p><script>alert(1)</script></body></html>",
    );

    expect(html).not.toContain("<script");
    expect(html).toContain("ahoj");
    expect(removed).toBe(1);
  });

  it("removes inline handlers, which a stripped script tag would leave running", () => {
    const { html, removed } = sanitize(
      '<html><body><button onclick="steal()">Klik</button></body></html>',
    );

    expect(html).not.toMatch(/onclick/i);
    expect(html).toContain("Klik");
    expect(removed).toBe(1);
  });

  it("catches a handler however it is capitalised", () => {
    const { html } = sanitize('<html><body><img src="x" OnError="steal()"></body></html>');

    expect(html).not.toMatch(/onerror/i);
  });

  it("reports nothing removed for a copy that was already inert", () => {
    // What the serialiser actually produces, per the spike: no scripts at all.
    const { removed } = sanitize("<html><body><p>ahoj</p></body></html>");

    expect(removed).toBe(0);
  });

  it("leaves styles and content untouched", () => {
    const source = "<html><head><style>p{color:red}</style></head><body><p>text</p></body></html>";
    const { html } = sanitize(source);
    const { document } = new JSDOM(html).window;

    expect(document.querySelector("style")?.textContent).toContain("color:red");
    expect(document.querySelector("p")?.textContent).toBe("text");
  });
});

describe("the serialiser's own bootstrap script", () => {
  // Found while building capture: the file contains a script that attaches
  // declarative shadow roots and then removes itself, so counting scripts in a
  // loaded page says zero while the file on disk is not inert. The spike's
  // criterion (d) measured the loaded page and reported zero for that reason.
  const withBootstrap =
    '<html><body><div id="host"><template shadowrootmode="open"><p>uvnitř</p></template></div>' +
    "<script data-template-shadow-root>document.currentScript.remove()</script></body></html>";

  it("is removed like any other script", () => {
    const { html, removed } = sanitize(withBootstrap);

    expect(html).not.toContain("data-template-shadow-root");
    expect(removed).toBe(1);
  });

  it("leaves the shadow template in place, since browsers attach it themselves", () => {
    const { html } = sanitize(withBootstrap);

    expect(html).toContain('shadowrootmode="open"');
    expect(html).toContain("uvnitř");
  });
});

describe("things that run without a script tag", () => {
  it("sandboxes a frame instead of trusting its inlined document", () => {
    // The serialiser inlines frames as srcdoc, so their content is part of the
    // page under review — deleting it would lose real content. A srcdoc frame
    // carrying a script runs it on load, with no interaction, and can reach the
    // page holding it. An empty sandbox takes that away and keeps the content.
    const { html, removed } = sanitize(
      `<html><body><iframe srcdoc="<script>parent.postMessage('pwned','*')</script>"></iframe></body></html>`,
    );
    const { document } = new JSDOM(html).window;

    expect(document.querySelector("iframe")?.getAttribute("sandbox")).toBe("");
    expect(removed).toBe(1);
  });

  it("leaves an already sandboxed frame alone", () => {
    const { removed } = sanitize(
      '<html><body><iframe sandbox="" srcdoc="ahoj"></iframe></body></html>',
    );

    expect(removed).toBe(0);
  });

  it.each([
    ["href", `<a href="javascript:steal()">odkaz</a>`],
    ["src", `<img src="javascript:steal()">`],
    ["formaction", `<button formaction="javascript:steal()">odeslat</button>`],
    ["action", `<form action="javascript:steal()"></form>`],
  ])("drops a %s that would execute instead of fetch", (attribute, markup) => {
    const { html, removed } = sanitize(`<html><body>${markup}</body></html>`);

    expect(html).not.toMatch(/javascript:/i);
    expect(removed).toBe(1);
    expect(html).not.toContain(`${attribute}="javascript`);
  });

  it("drops a data URL that carries a document of its own", () => {
    const { html } = sanitize(
      '<html><body><iframe src="data:text/html,<script>steal()</script>"></iframe></body></html>',
    );

    expect(html).not.toContain("data:text/html");
  });

  it("keeps an ordinary link and an ordinary image", () => {
    const { html, removed } = sanitize(
      '<html><body><a href="/kontakt">kontakt</a><img src="data:image/gif;base64,R0lGOD"></body></html>',
    );

    expect(html).toContain('href="/kontakt"');
    expect(html).toContain("data:image/gif");
    expect(removed).toBe(0);
  });

  it("removes a script inside svg, which is a different element with the same name", () => {
    const { html, removed } = sanitize(
      "<html><body><svg><script>steal()</script><circle r='5'/></svg></body></html>",
    );

    expect(html).not.toContain("steal()");
    expect(html).toContain("circle");
    expect(removed).toBe(1);
  });
});
