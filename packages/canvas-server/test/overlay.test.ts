import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initOverlay } from "../overlay/overlay.js";

const PAGE = `<!doctype html><html><head><title>t</title></head><body>
  <h1 data-cx-id="cx-0">Naše služby</h1>
  <p data-cx-id="cx-1">Odstavec</p>
  <div>bez identifikátoru</div>
</body></html>`;

type Win = JSDOM["window"];
/** DOM element type borrowed from jsdom — this package compiles without the DOM lib. */
type El = ReturnType<Win["document"]["createElement"]>;

function fetchOk(payload: unknown = {}): ReturnType<typeof vi.fn> {
  return vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) }));
}

let win: Win;
let fetchMock: ReturnType<typeof fetchOk>;

beforeEach(() => {
  win = new JSDOM(PAGE, { url: "http://localhost:4000/" }).window;
  fetchMock = fetchOk({ reviewPath: "/tmp/review.json", changes: 1, comments: 0 });
  (win as unknown as { fetch: unknown }).fetch = fetchMock;
});

function element(cxId: string) {
  const found = win.document.querySelector(`[data-cx-id="${cxId}"]`);
  if (found === null) {
    throw new Error(`chybí ${cxId}`);
  }
  return found as El;
}

function dispatch(target: EventTarget, type: string, init: Record<string, unknown> = {}): void {
  target.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

function key(type: string, init: Record<string, unknown>): void {
  win.document.dispatchEvent(
    new win.KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }),
  );
}

async function settled(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("initOverlay", () => {
  it("celé UI žije v shadow rootu — do stránky nepřibude žádný styl", () => {
    const before = win.document.querySelectorAll("style, link").length;
    const host = initOverlay(win);
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.querySelector("style")).not.toBeNull();
    expect(win.document.querySelectorAll("style, link")).toHaveLength(before);
  });

  it("druhé volání overlay nezdvojí", () => {
    initOverlay(win);
    expect(initOverlay(win)).toBeNull();
    expect(win.document.querySelectorAll("#cx-overlay-host")).toHaveLength(1);
  });

  it("najetí myší ukáže zvýraznění, mimo instrumentované prvky je skryje", () => {
    const host = initOverlay(win);
    const hover = host?.shadowRoot?.querySelector("[data-role='hover']") as El;
    expect(hover.hasAttribute("hidden")).toBe(true);

    dispatch(element("cx-0"), "mousemove");
    expect(hover.hasAttribute("hidden")).toBe(false);

    dispatch(win.document.body, "mousemove");
    expect(hover.hasAttribute("hidden")).toBe(true);
  });

  it("klik vybere prvek a výběr je vidět", () => {
    const host = initOverlay(win);
    const selection = host?.shadowRoot?.querySelector("[data-role='select']") as El;
    expect(selection.hasAttribute("hidden")).toBe(true);

    dispatch(element("cx-1"), "click");
    expect(selection.hasAttribute("hidden")).toBe(false);
  });

  it("dvojklik zapne editaci na místě a blur pošle {cx-id, before, after} hned", async () => {
    initOverlay(win);
    const heading = element("cx-0");

    dispatch(heading, "dblclick");
    expect(heading.getAttribute("contenteditable")).toBeTruthy();

    heading.textContent = "Co umíme";
    heading.dispatchEvent(new win.FocusEvent("blur"));
    await settled();

    expect(heading.hasAttribute("contenteditable")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/events");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toMatchObject({
      type: "text-edit",
      cxId: "cx-0",
      before: "Naše služby",
      after: "Co umíme",
    });
  });

  it("editace beze změny žádný event nepošle", async () => {
    initOverlay(win);
    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.dispatchEvent(new win.FocusEvent("blur"));
    await settled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Escape editaci zruší a vrátí původní text", async () => {
    initOverlay(win);
    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.textContent = "Rozepsané";
    heading.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await settled();

    expect(heading.textContent).toBe("Naše služby");
    expect(heading.hasAttribute("contenteditable")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Enter editaci potvrdí", async () => {
    initOverlay(win);
    const paragraph = element("cx-1");
    dispatch(paragraph, "dblclick");
    paragraph.textContent = "Věta";
    paragraph.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    await settled();

    expect(paragraph.hasAttribute("contenteditable")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dvě po sobě jdoucí editace pošlou dva eventy — nic nečeká na zavření", async () => {
    initOverlay(win);
    const heading = element("cx-0");

    dispatch(heading, "dblclick");
    heading.textContent = "Jedna";
    heading.dispatchEvent(new win.FocusEvent("blur"));
    await settled();

    dispatch(heading, "dblclick");
    heading.textContent = "Dvě";
    heading.dispatchEvent(new win.FocusEvent("blur"));
    await settled();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prvek bez data-cx-id se nedá editovat ani vybrat", () => {
    const host = initOverlay(win);
    const plain = win.document.querySelector("div") as El;
    dispatch(plain, "dblclick");
    dispatch(plain, "click");
    expect(plain.hasAttribute("contenteditable")).toBe(false);
    const selection = host?.shadowRoot?.querySelector("[data-role='select']") as El;
    expect(selection.hasAttribute("hidden")).toBe(true);
  });

  it("Ctrl+Enter uzavře review a toast ukáže cestu k výstupu", async () => {
    const host = initOverlay(win);
    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();

    expect(fetchMock).toHaveBeenCalledWith("/done", expect.objectContaining({ method: "POST" }));
    const toast = host?.shadowRoot?.querySelector("[data-role='toast']") as El;
    expect(toast.hasAttribute("hidden")).toBe(false);
    expect(toast.textContent).toContain("/tmp/review.json");
  });

  it("Ctrl+Enter s rozepsanou editací ji nejdřív uloží, pak teprve uzavře", async () => {
    initOverlay(win);
    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.textContent = "Rozepsáno";

    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();

    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls).toEqual(["/events", "/done"]);
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ cxId: "cx-0", before: "Naše služby", after: "Rozepsáno" });
    expect(heading.textContent).toBe("Rozepsáno");
  });

  it("Hotovo s rozepsanou editací ji také uloží", async () => {
    const host = initOverlay(win);
    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.textContent = "Na poslední chvíli";

    const button = host?.shadowRoot?.querySelector("button[data-role='done']") as El;
    dispatch(button, "click");
    await settled();

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/events", "/done"]);
  });

  it("tlačítko Hotovo uzavře review", async () => {
    const host = initOverlay(win);
    const button = host?.shadowRoot?.querySelector("button[data-role='done']") as El;
    dispatch(button, "click");
    await settled();
    expect(fetchMock).toHaveBeenCalledWith("/done", expect.objectContaining({ method: "POST" }));
  });

  it("po uzavření už overlay žádné akce neposílá", async () => {
    initOverlay(win);
    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();
    fetchMock.mockClear();

    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    expect(heading.hasAttribute("contenteditable")).toBe(false);
    heading.dispatchEvent(new win.FocusEvent("blur"));
    await settled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
