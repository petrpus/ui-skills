import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initOverlay } from "../overlay/overlay.js";

const PAGE = `<!doctype html><html><head><title>t</title></head><body>
  <main data-cx-id="cx-9"><section data-cx-id="cx-8">
    <h1 data-cx-id="cx-0">Naše služby</h1>
    <p data-cx-id="cx-1">Odstavec</p>
  </section></main>
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

describe("komentáře (C + klik)", () => {
  function holdC(): void {
    key("keydown", { key: "c" });
  }

  function openFormOn(cxId: string) {
    const host = initOverlay(win);
    holdC();
    dispatch(element(cxId), "click");
    key("keyup", { key: "c" });
    return host;
  }

  function part(host: ReturnType<typeof initOverlay>, role: string): El {
    const found = host?.shadowRoot?.querySelector(`[data-role='${role}']`);
    if (found === null || found === undefined) {
      throw new Error(`ve stínu chybí ${role}`);
    }
    return found as El;
  }

  it("C + klik otevře bublinu komentáře, běžný klik ne", () => {
    const host = initOverlay(win);
    dispatch(element("cx-1"), "click");
    expect(part(host, "comment").hasAttribute("hidden")).toBe(true);

    holdC();
    dispatch(element("cx-1"), "click");
    expect(part(host, "comment").hasAttribute("hidden")).toBe(false);
  });

  it("uložení pošle komentář s cílem, kategorií i prioritou okamžitě", async () => {
    const host = openFormOn("cx-1");
    (part(host, "comment-text") as El & { value: string }).value = "Celý blok přepracovat.";
    (part(host, "comment-category") as El & { value: string }).value = "idea";
    (part(host, "comment-priority") as El & { value: string }).value = "high";

    dispatch(part(host, "comment-save"), "click");
    await settled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/events");
    expect(JSON.parse(options.body as string)).toEqual({
      type: "comment",
      cxId: "cx-1",
      text: "Celý blok přepracovat.",
      category: "idea",
      priority: "high",
    });
    expect(part(host, "comment").hasAttribute("hidden")).toBe(true);
  });

  it("výchozí kategorie je change-request a priorita medium", async () => {
    const host = openFormOn("cx-0");
    (part(host, "comment-text") as El & { value: string }).value = "Menší nadpis.";
    dispatch(part(host, "comment-save"), "click");
    await settled();

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toMatchObject({
      category: "change-request",
      priority: "medium",
    });
  });

  it("prázdný text se neuloží", async () => {
    const host = openFormOn("cx-1");
    dispatch(part(host, "comment-save"), "click");
    await settled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(part(host, "comment").hasAttribute("hidden")).toBe(true);
  });

  it("Zrušit rozepsaný komentář zahodí", async () => {
    const host = openFormOn("cx-1");
    (part(host, "comment-text") as El & { value: string }).value = "Rozepsané…";
    dispatch(part(host, "comment-cancel"), "click");
    await settled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(part(host, "comment").hasAttribute("hidden")).toBe(true);
  });

  it("komentář jde připnout k prvku bez jakékoli textové editace", async () => {
    const host = openFormOn("cx-1");
    (part(host, "comment-text") as El & { value: string }).value = "Hover stav tlačítka chybí.";
    dispatch(part(host, "comment-save"), "click");
    await settled();

    const bodies = fetchMock.mock.calls.map((call) =>
      JSON.parse(((call as [string, RequestInit])[1] as { body: string }).body),
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ type: "comment", cxId: "cx-1" });
  });

  it("uložený komentář nechá na prvku viditelnou značku", async () => {
    const host = openFormOn("cx-1");
    (part(host, "comment-text") as El & { value: string }).value = "Značka.";
    dispatch(part(host, "comment-save"), "click");
    await settled();
    expect(host?.shadowRoot?.querySelectorAll("[data-role='pin']")).toHaveLength(1);
  });

  it("psaní písmene c při editaci textu bublinu neotvírá", () => {
    const host = initOverlay(win);
    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "c", bubbles: true, cancelable: true }),
    );
    dispatch(element("cx-1"), "click");
    expect(part(host, "comment").hasAttribute("hidden")).toBe(true);
  });

  it("po uzavření review už C + klik nic neotvírá", async () => {
    const host = initOverlay(win);
    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();
    fetchMock.mockClear();

    holdC();
    dispatch(element("cx-1"), "click");
    expect(part(host, "comment").hasAttribute("hidden")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("komentáře — nálezy z review", () => {
  function holdC(): void {
    key("keydown", { key: "c" });
  }

  function form(host: ReturnType<typeof initOverlay>): El {
    return host?.shadowRoot?.querySelector("[data-role='comment']") as El;
  }

  it("psaní 'c' v inputu zmrazené stránky C+klik nevyzbrojí", () => {
    const input = win.document.createElement("input");
    win.document.body.appendChild(input);
    const host = initOverlay(win);

    input.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "c", bubbles: true, cancelable: true }),
    );
    dispatch(element("cx-1"), "click");
    expect(form(host).hasAttribute("hidden")).toBe(true);
  });

  it("Escape v bublině rozepsaný komentář zahodí", async () => {
    const host = initOverlay(win);
    holdC();
    dispatch(element("cx-1"), "click");
    const text = host?.shadowRoot?.querySelector("[data-role='comment-text']") as El & {
      value: string;
    };
    text.value = "Rozepsané…";
    text.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await settled();
    expect(form(host).hasAttribute("hidden")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uzavření s rozepsaným komentářem ho nejdřív uloží, pak zavře", async () => {
    const host = initOverlay(win);
    holdC();
    dispatch(element("cx-1"), "click");
    (
      host?.shadowRoot?.querySelector("[data-role='comment-text']") as El & { value: string }
    ).value = "Na poslední chvíli.";

    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();

    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls).toEqual(["/events", "/done"]);
    const body = JSON.parse(
      ((fetchMock.mock.calls[0] as [string, RequestInit])[1] as { body: string }).body,
    );
    expect(body).toMatchObject({ type: "comment", text: "Na poslední chvíli." });
  });

  it("editace a bublina se vylučují: dblclick rozepsaný komentář zahodí a uzavření flushne jen editaci", async () => {
    const host = initOverlay(win);
    holdC();
    dispatch(element("cx-1"), "click");
    (
      host?.shadowRoot?.querySelector("[data-role='comment-text']") as El & { value: string }
    ).value = "Komentář.";
    key("keyup", { key: "c" });

    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    expect(form(host).hasAttribute("hidden")).toBe(true);
    heading.textContent = "Rozepsáno";

    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();

    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls).toEqual(["/events", "/done"]);
    const body = JSON.parse(
      ((fetchMock.mock.calls[0] as [string, RequestInit])[1] as { body: string }).body,
    );
    expect(body).toMatchObject({ type: "text-edit", after: "Rozepsáno" });
  });

  it("syntetický dblclick zavře otevřenou bublinu", () => {
    const host = initOverlay(win);
    holdC();
    dispatch(element("cx-1"), "click");
    key("keyup", { key: "c" });
    expect(form(host).hasAttribute("hidden")).toBe(false);

    dispatch(element("cx-0"), "dblclick");
    expect(form(host).hasAttribute("hidden")).toBe(true);
  });
});

describe("breadcrumb rodičů", () => {
  function bar(host: ReturnType<typeof initOverlay>): El {
    return host?.shadowRoot?.querySelector("[data-role='breadcrumb']") as El;
  }

  function crumbs(host: ReturnType<typeof initOverlay>): El[] {
    return Array.from(
      host?.shadowRoot?.querySelectorAll("button[data-role='crumb']") ?? [],
    ) as El[];
  }

  it("bez výběru je lišta skrytá, výběr ukáže cestu rodičů s aktuálním prvkem na konci", () => {
    const host = initOverlay(win);
    expect(bar(host).hasAttribute("hidden")).toBe(true);

    dispatch(element("cx-1"), "click");
    expect(bar(host).hasAttribute("hidden")).toBe(false);
    const labels = crumbs(host).map((crumb) => crumb.textContent);
    expect(labels).toEqual(["main", "section", "p"]);
    expect(crumbs(host)[2]?.getAttribute("data-current")).toBe("true");
  });

  it("kliknutí na položku cesty výběr povýší a zvýraznění se přesune", () => {
    const host = initOverlay(win);
    dispatch(element("cx-1"), "click");

    const section = crumbs(host)[1] as El;
    dispatch(section, "click");

    const labels = crumbs(host).map((crumb) => crumb.textContent);
    expect(labels).toEqual(["main", "section"]);
    expect(crumbs(host)[1]?.getAttribute("data-current")).toBe("true");
  });

  it("komentář z lišty se váže na povýšený výběr, ne na původní prvek", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-1"), "click");
    dispatch(crumbs(host)[1] as El, "click");

    dispatch(host?.shadowRoot?.querySelector("[data-role='crumb-comment']") as El, "click");
    const text = host?.shadowRoot?.querySelector("[data-role='comment-text']") as El & {
      value: string;
    };
    text.value = "Celou sekci přepracovat.";
    dispatch(host?.shadowRoot?.querySelector("[data-role='comment-save']") as El, "click");
    await settled();

    const body = JSON.parse(
      ((fetchMock.mock.calls[0] as [string, RequestInit])[1] as { body: string }).body,
    );
    expect(body).toMatchObject({ type: "comment", cxId: "cx-8" });
  });

  it("editace z lišty edituje povýšený výběr", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-0"), "click");
    dispatch(crumbs(host)[1] as El, "click");

    dispatch(host?.shadowRoot?.querySelector("[data-role='crumb-edit']") as El, "click");
    const section = element("cx-8");
    expect(section.getAttribute("contenteditable")).toBeTruthy();

    section.textContent = "Nový obsah sekce";
    section.dispatchEvent(new win.FocusEvent("blur"));
    await settled();

    const body = JSON.parse(
      ((fetchMock.mock.calls[0] as [string, RequestInit])[1] as { body: string }).body,
    );
    expect(body).toMatchObject({ type: "text-edit", cxId: "cx-8", after: "Nový obsah sekce" });
  });

  it("po uzavření review lišta zmizí a její akce nic nedělají", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-1"), "click");
    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();
    fetchMock.mockClear();

    expect(bar(host).hasAttribute("hidden")).toBe(true);
    dispatch(host?.shadowRoot?.querySelector("[data-role='crumb-edit']") as El, "click");
    expect(element("cx-1").hasAttribute("contenteditable")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prvek bez instrumentovaných rodičů má v cestě jen sám sebe", () => {
    const host = initOverlay(win);
    // html ani body nemají data-cx-id, main je nejvyšší instrumentovaný prvek
    dispatch(element("cx-9"), "click");
    expect(crumbs(host).map((crumb) => crumb.textContent)).toEqual(["main"]);
  });
});

describe("breadcrumb — nálezy z review", () => {
  function crumbs(host: ReturnType<typeof initOverlay>): El[] {
    return Array.from(
      host?.shadowRoot?.querySelectorAll("button[data-role='crumb']") ?? [],
    ) as El[];
  }

  it("povýšení během editace ji nejdřív commitne — klávesy nejdou do špatného prvku", async () => {
    const host = initOverlay(win);
    const paragraph = element("cx-1");
    dispatch(paragraph, "dblclick");
    paragraph.textContent = "Rozepsáno";

    dispatch(crumbs(host)[1] as El, "click");
    await settled();

    expect(paragraph.hasAttribute("contenteditable")).toBe(false);
    const body = JSON.parse(
      ((fetchMock.mock.calls[0] as [string, RequestInit])[1] as { body: string }).body,
    );
    expect(body).toMatchObject({ type: "text-edit", cxId: "cx-1", after: "Rozepsáno" });
  });

  it("povýšení s otevřenou bublinou ji zavře — komentář se nepřipne ke špatnému prvku", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-1"), "click");
    dispatch(host?.shadowRoot?.querySelector("[data-role='crumb-comment']") as El, "click");
    (
      host?.shadowRoot?.querySelector("[data-role='comment-text']") as El & { value: string }
    ).value = "Rozepsaný návrh…";

    dispatch(crumbs(host)[1] as El, "click");
    const form = host?.shadowRoot?.querySelector("[data-role='comment']") as El;
    expect(form.hasAttribute("hidden")).toBe(true);

    dispatch(host?.shadowRoot?.querySelector("[data-role='comment-save']") as El, "click");
    await settled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("crumb na právě editovaný prvek editaci neukončí", () => {
    const host = initOverlay(win);
    const section = element("cx-8");
    dispatch(section, "click");
    dispatch(host?.shadowRoot?.querySelector("[data-role='crumb-edit']") as El, "click");
    expect(section.getAttribute("contenteditable")).toBeTruthy();

    const current = crumbs(host).find((crumb) => crumb.getAttribute("data-current") === "true");
    dispatch(current as El, "click");
    expect(section.getAttribute("contenteditable")).toBeTruthy();
  });
});

describe("flush rozlétnutých eventů před /done (#48)", () => {
  interface Deferred {
    resolve(): void;
  }

  function deferredFetch(): { mock: ReturnType<typeof vi.fn>; pending: Deferred[] } {
    const pending: Deferred[] = [];
    const mock = vi.fn((url: string) => {
      if (url === "/events") {
        return new Promise((resolve) => {
          pending.push({
            resolve: () => resolve({ ok: true, json: () => Promise.resolve({}) }),
          });
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ reviewPath: "/tmp/r" }) });
    });
    return { mock, pending };
  }

  it("Hotovo počká na event z blur commitu, /done neodejde dřív", async () => {
    const { mock, pending } = deferredFetch();
    (win as unknown as { fetch: unknown }).fetch = mock;
    initOverlay(win);

    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.textContent = "Rozlétnuté";
    heading.dispatchEvent(new win.FocusEvent("blur"));
    await settled();
    expect(pending).toHaveLength(1);

    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();
    expect(mock.mock.calls.map((call) => call[0])).toEqual(["/events"]);

    pending[0]?.resolve();
    await settled();
    expect(mock.mock.calls.map((call) => call[0])).toEqual(["/events", "/done"]);
  });

  it("Uložit a hned Hotovo: komentář závod nikdy neprohraje", async () => {
    const { mock, pending } = deferredFetch();
    (win as unknown as { fetch: unknown }).fetch = mock;
    const host = initOverlay(win);

    key("keydown", { key: "c" });
    dispatch(element("cx-1"), "click");
    key("keyup", { key: "c" });
    (
      host?.shadowRoot?.querySelector("[data-role='comment-text']") as El & { value: string }
    ).value = "Na hraně.";
    dispatch(host?.shadowRoot?.querySelector("[data-role='comment-save']") as El, "click");
    await settled();
    expect(pending).toHaveLength(1);

    dispatch(host?.shadowRoot?.querySelector("button[data-role='done']") as El, "click");
    await settled();
    expect(mock.mock.calls.map((call) => call[0])).toEqual(["/events"]);

    pending[0]?.resolve();
    await settled();
    expect(mock.mock.calls.map((call) => call[0])).toEqual(["/events", "/done"]);
  });
});

describe("zavření záložky s rozdělanou prací (#42)", () => {
  function beforeUnload(): boolean {
    const event = new win.Event("beforeunload", { cancelable: true });
    win.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it("eventy se posílají s keepalive — přežijí unload", async () => {
    initOverlay(win);
    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.textContent = "Trvanlivé";
    heading.dispatchEvent(new win.FocusEvent("blur"));
    await settled();

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit & { keepalive?: boolean }];
    expect(options.keepalive).toBe(true);
  });

  it("beforeunload varuje při rozepsané změněné editaci", () => {
    initOverlay(win);
    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.textContent = "Rozepsáno";
    expect(beforeUnload()).toBe(true);
  });

  it("beforeunload varuje při neprázdném konceptu komentáře", () => {
    const host = initOverlay(win);
    key("keydown", { key: "c" });
    dispatch(element("cx-1"), "click");
    key("keyup", { key: "c" });
    (
      host?.shadowRoot?.querySelector("[data-role='comment-text']") as El & { value: string }
    ).value = "Rozepsaný koncept";
    expect(beforeUnload()).toBe(true);
  });

  it("bez rozdělané práce ani po uzavření review nevaruje", async () => {
    initOverlay(win);
    expect(beforeUnload()).toBe(false);

    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    expect(beforeUnload()).toBe(false); // editace beze změny není rozdělaná práce

    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();
    expect(beforeUnload()).toBe(false);
  });

  it("pagehide flushne rozepsanou editaci", async () => {
    initOverlay(win);
    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.textContent = "Na odchodu";

    win.dispatchEvent(new win.Event("pagehide"));
    await settled();

    expect(heading.hasAttribute("contenteditable")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ type: "text-edit", after: "Na odchodu" });
  });

  it("pagehide flushne i neprázdný koncept komentáře", async () => {
    const host = initOverlay(win);
    key("keydown", { key: "c" });
    dispatch(element("cx-1"), "click");
    key("keyup", { key: "c" });
    (
      host?.shadowRoot?.querySelector("[data-role='comment-text']") as El & { value: string }
    ).value = "Poslední slovo.";

    win.dispatchEvent(new win.Event("pagehide"));
    await settled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ type: "comment", text: "Poslední slovo." });
  });

  it("pagehide po uzavření review nic neposílá", async () => {
    initOverlay(win);
    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();
    fetchMock.mockClear();

    win.dispatchEvent(new win.Event("pagehide"));
    await settled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reentrance commitEdit (#42 review)", () => {
  it("synchronní blur při odebrání contenteditable nepošle edit dvakrát", async () => {
    initOverlay(win);
    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.textContent = "Jednou";

    // Real browsers fire blur synchronously when contenteditable is removed
    // from the focused element; jsdom does not, so the quirk is simulated.
    const originalRemove = heading.removeAttribute.bind(heading);
    (heading as El & { removeAttribute(name: string): void }).removeAttribute = (name: string) => {
      originalRemove(name);
      if (name === "contenteditable") {
        heading.dispatchEvent(new win.FocusEvent("blur"));
      }
    };

    heading.dispatchEvent(new win.FocusEvent("blur"));
    await settled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("koncept komentáře jen z mezer beforeunload nevyzbrojí", () => {
    const host = initOverlay(win);
    key("keydown", { key: "c" });
    dispatch(element("cx-1"), "click");
    key("keyup", { key: "c" });
    (
      host?.shadowRoot?.querySelector("[data-role='comment-text']") as El & { value: string }
    ).value = "   ";
    const event = new win.Event("beforeunload", { cancelable: true });
    win.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("UX overlay (#44)", () => {
  it("clampPosition drží bublinu ve viewportu", async () => {
    const { clampPosition } = await import("../overlay/overlay.js");
    const size = { width: 280, height: 160 };
    const viewport = { width: 1000, height: 600 };

    // Fits below the anchor → sits below with a margin.
    expect(clampPosition({ top: 100, bottom: 120, left: 50 }, size, viewport)).toEqual({
      top: 128,
      left: 50,
    });
    // Bottom edge → flips above the anchor.
    expect(clampPosition({ top: 500, bottom: 520, left: 50 }, size, viewport)).toEqual({
      top: 332,
      left: 50,
    });
    // Right edge → pulled back inside.
    expect(clampPosition({ top: 100, bottom: 120, left: 900 }, size, viewport).left).toBe(712);
    // Left overflow → margin.
    expect(clampPosition({ top: 100, bottom: 120, left: -30 }, size, viewport).left).toBe(8);
    // No room above nor below → clamped to the bottom margin.
    const cramped = clampPosition({ top: 80, bottom: 520, left: 50 }, size, {
      width: 1000,
      height: 300,
    });
    expect(cramped.top).toBe(132);
  });

  it("chybový toast nepřepíše úspěšný — zprávy se skládají", async () => {
    let failNext = true;
    const mock = vi.fn((url: string) => {
      if (url === "/events" && failNext) {
        failNext = false;
        return Promise.reject(new Error("spadlo"));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ reviewPath: "/tmp/r.json" }),
      });
    });
    (win as unknown as { fetch: unknown }).fetch = mock;

    const host = initOverlay(win);
    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.textContent = "Neuloží se";
    heading.dispatchEvent(new win.FocusEvent("blur"));
    await settled();

    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();
    await settled();

    const toast = host?.shadowRoot?.querySelector("[data-role='toast']") as El;
    const messages = Array.from(toast.querySelectorAll("[data-role='toast-message']")).map(
      (note) => note.textContent,
    );
    expect(messages.some((text) => text?.includes("neuložila"))).toBe(true);
    expect(messages.some((text) => text?.includes("/tmp/r.json"))).toBe(true);
  });

  it("Hotovo dává během čekání na flush zpětnou vazbu", async () => {
    let resolveEvents: (() => void) | undefined;
    const mock = vi.fn((url: string) => {
      if (url === "/events") {
        return new Promise((resolve) => {
          resolveEvents = () => resolve({ ok: true, json: () => Promise.resolve({}) });
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ reviewPath: "/tmp/r" }) });
    });
    (win as unknown as { fetch: unknown }).fetch = mock;

    const host = initOverlay(win);
    const heading = element("cx-0");
    dispatch(heading, "dblclick");
    heading.textContent = "Pomalu";
    heading.dispatchEvent(new win.FocusEvent("blur"));
    await settled();

    const button = host?.shadowRoot?.querySelector("button[data-role='done']") as El & {
      disabled: boolean;
    };
    dispatch(button, "click");
    await settled();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Ukládám");

    resolveEvents?.();
    await settled();
    await settled();
    const toast = host?.shadowRoot?.querySelector("[data-role='toast']") as El;
    expect(toast.textContent).toContain("/tmp/r");
  });
});

describe("skrýt a smazat (#57)", () => {
  function bar(host: ReturnType<typeof initOverlay>, role: string): El {
    return host?.shadowRoot?.querySelector(`[data-role='${role}']`) as El;
  }

  it("Skrýt element zneviditelní a pošle hide s podstromem hned", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-8"), "click");
    dispatch(bar(host, "crumb-hide"), "click");
    await settled();

    const section = element("cx-8");
    expect(section.style.display).toBe("none");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({
      type: "hide",
      cxId: "cx-8",
      subtree: { tag: "section", elements: 3 },
    });
    expect(body.subtree.textFingerprint).toContain("Naše služby");
  });

  it("Smazat element odstraní z DOM a pošle remove s podstromem", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-0"), "click");
    dispatch(bar(host, "crumb-remove"), "click");
    await settled();

    expect(win.document.querySelector('[data-cx-id="cx-0"]')).toBeNull();
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({
      type: "remove",
      cxId: "cx-0",
      subtree: { tag: "h1", elements: 1 },
    });
  });

  it("po smazání zmizí výběr i breadcrumb", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-0"), "click");
    dispatch(bar(host, "crumb-remove"), "click");
    await settled();

    expect(bar(host, "select").hasAttribute("hidden")).toBe(true);
    expect(bar(host, "breadcrumb").hasAttribute("hidden")).toBe(true);
  });

  it("po uzavření review akce nic neposílají", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-0"), "click");
    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();
    fetchMock.mockClear();

    dispatch(bar(host, "crumb-hide"), "click");
    dispatch(bar(host, "crumb-remove"), "click");
    await settled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(win.document.querySelector('[data-cx-id="cx-0"]')).not.toBeNull();
  });
});

describe("duplikace (#58)", () => {
  function button(host: ReturnType<typeof initOverlay>): El {
    return host?.shadowRoot?.querySelector("[data-role='crumb-duplicate']") as El;
  }

  it("Duplikovat vloží klon za originál a celému podstromu dá syntetická id", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-8"), "click");
    dispatch(button(host), "click");
    await settled();

    const sections = win.document.querySelectorAll("section");
    expect(sections).toHaveLength(2);
    const clone = sections[1] as El;
    expect(clone.getAttribute("data-cx-id")).toMatch(/^cx-d[a-z0-9]+-\d+$/);
    const cloneIds = Array.from(clone.querySelectorAll("[data-cx-id]")).map((node) =>
      (node as El).getAttribute("data-cx-id"),
    );
    expect(cloneIds.every((id) => id?.startsWith("cx-d"))).toBe(true);
    // Originál zůstává netknutý.
    expect(element("cx-8").getAttribute("data-cx-id")).toBe("cx-8");
  });

  it("event duplicate nese mapování celého podstromu", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-8"), "click");
    dispatch(button(host), "click");
    await settled();

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.type).toBe("duplicate");
    expect(body.cxId).toBe("cx-8");
    expect(Object.keys(body.mapping)).toEqual(["cx-8", "cx-0", "cx-1"]);
    expect(body.mapping["cx-8"]).toMatch(/^cx-d[a-z0-9]+-\d+$/);
  });

  it("dva kliky dají dva klony s různými id", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-1"), "click");
    dispatch(button(host), "click");
    dispatch(button(host), "click");
    await settled();

    const first = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const second = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(first.mapping["cx-1"]).not.toBe(second.mapping["cx-1"]);
    expect(win.document.querySelectorAll("p").length).toBe(3);
  });

  it("duplikát jde vybrat a editovat — edit odkazuje na syntetické id", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-1"), "click");
    dispatch(button(host), "click");
    await settled();
    fetchMock.mockClear();

    const clone = win.document.querySelectorAll("p")[1] as El;
    dispatch(clone, "dblclick");
    clone.textContent = "Jiný text";
    clone.dispatchEvent(new win.FocusEvent("blur"));
    await settled();

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.type).toBe("text-edit");
    expect(body.cxId).toMatch(/^cx-d[a-z0-9]+-\d+$/);
  });

  it("po uzavření review duplikace nic nedělá", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-1"), "click");
    key("keydown", { key: "Enter", ctrlKey: true });
    await settled();
    fetchMock.mockClear();

    dispatch(button(host), "click");
    await settled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(win.document.querySelectorAll("p")).toHaveLength(1);
  });
});

describe("duplikace — nálezy z review (#58)", () => {
  it("dva booty overlaye nad touž stránkou nemintují kolidující id", async () => {
    const host1 = initOverlay(win);
    dispatch(element("cx-1"), "click");
    dispatch(host1?.shadowRoot?.querySelector("[data-role='crumb-duplicate']") as El, "click");
    await settled();
    const first = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);

    // Druhá záložka / reload: čerstvé okno, týž log na serveru.
    const win2 = new JSDOM(PAGE, { url: "http://localhost:4000/" }).window;
    const fetch2 = fetchOk({});
    (win2 as unknown as { fetch: unknown }).fetch = fetch2;
    const host2 = initOverlay(win2);
    const paragraph2 = win2.document.querySelector('[data-cx-id="cx-1"]') as El;
    paragraph2.dispatchEvent(new win2.MouseEvent("click", { bubbles: true, cancelable: true }));
    dispatch2(win2, host2?.shadowRoot?.querySelector("[data-role='crumb-duplicate']") as El);
    await settled();
    const second = JSON.parse((fetch2.mock.calls[0] as [string, RequestInit])[1].body as string);

    expect(first.mapping["cx-1"]).not.toBe(second.mapping["cx-1"]);
  });

  it("duplikát duplikátu degraduje bezpečně — event má syntetické klíče", async () => {
    const host = initOverlay(win);
    dispatch(element("cx-1"), "click");
    dispatch(host?.shadowRoot?.querySelector("[data-role='crumb-duplicate']") as El, "click");
    await settled();

    const clone = win.document.querySelectorAll("p")[1] as El;
    dispatch(clone, "click");
    dispatch(host?.shadowRoot?.querySelector("[data-role='crumb-duplicate']") as El, "click");
    await settled();

    const second = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(second.type).toBe("duplicate");
    expect(Object.keys(second.mapping).every((key) => key.startsWith("cx-d"))).toBe(true);
    expect(win.document.querySelectorAll("p")).toHaveLength(3);
  });
});

function dispatch2(win2: Win, target: EventTarget): void {
  target.dispatchEvent(new win2.MouseEvent("click", { bubbles: true, cancelable: true }));
}
