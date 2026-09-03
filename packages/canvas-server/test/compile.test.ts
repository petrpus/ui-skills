import { validateReview } from "@ui-skills/schema";
import type { LocationMap } from "@ui-skills/snapshot";
import { describe, expect, it } from "vitest";
import { compileReview, renderReviewMarkdown } from "../src/compile.ts";
import type { CanvasEvent } from "../src/events.ts";

const map: LocationMap = {
  "cx-1": {
    selector: "html:nth-child(1) > body:nth-child(2) > h1:nth-child(1)",
    hostPath: [],
    xpath: "/html[1]/body[1]/h1[1]",
    textFingerprint: "Naše služby",
  },
  "cx-2": {
    selector: "p:nth-child(2)",
    hostPath: ["main:nth-child(1)"],
    textFingerprint: "Odstavec",
  },
};

function edit(cxId: string, before: string, after: string): CanvasEvent {
  return { type: "text-edit", cxId, before, after };
}

describe("compileReview", () => {
  it("prázdný log → validní prázdné review", () => {
    const review = compileReview([], map);
    expect(() => validateReview(review)).not.toThrow();
    expect(review.changes).toEqual([]);
    expect(review.comments).toEqual([]);
  });

  it("editace se stane změnou typu text s targetem obohaceným z mapy", () => {
    const review = compileReview([edit("cx-1", "Naše služby", "Služby")], map);
    expect(review.changes).toHaveLength(1);
    const change = review.changes[0];
    expect(change?.id).toBe("chg_001");
    expect(change !== undefined && "before" in change ? change.before : "").toBe("Naše služby");
    expect(change !== undefined && "after" in change ? change.after : "").toBe("Služby");
    expect(change?.target.selector).toContain("h1");
    expect(change?.target.xpath).toBe("/html[1]/body[1]/h1[1]");
    expect(change?.target.textFingerprint).toBe("Naše služby");
  });

  it("dvě editace téhož prvku se složí: before první, after poslední", () => {
    const review = compileReview(
      [edit("cx-1", "Naše služby", "Služby"), edit("cx-1", "Služby", "Co umíme")],
      map,
    );
    expect(review.changes).toHaveLength(1);
    const merged = review.changes[0];
    expect(merged !== undefined && "before" in merged ? merged.before : "").toBe("Naše služby");
    expect(merged !== undefined && "after" in merged ? merged.after : "").toBe("Co umíme");
  });

  it("editace vrácená na původní hodnotu se do výstupu nedostane", () => {
    const review = compileReview(
      [edit("cx-1", "Naše služby", "Služby"), edit("cx-1", "Služby", "Naše služby")],
      map,
    );
    expect(review.changes).toEqual([]);
  });

  it("hostPath prvku v shadow DOM se přenese do targetu", () => {
    const review = compileReview([edit("cx-2", "Odstavec", "Věta")], map);
    expect(review.changes[0]?.target.hostPath).toEqual(["main:nth-child(1)"]);
    expect(review.changes[0]?.target.xpath).toBeUndefined();
  });

  it("prvek mimo mapu dostane target jen s cxId", () => {
    const review = compileReview([edit("cx-99", "a", "b")], map);
    expect(review.changes[0]?.target).toEqual({ cxId: "cx-99" });
  });

  it("komentáře se přenesou s kategorií a prioritou, neznámé hodnoty se zahodí", () => {
    const review = compileReview(
      [
        { type: "comment", cxId: "cx-1", text: "Přepsat.", category: "change-request" },
        { type: "comment", cxId: "cx-2", text: "Proč?", category: "rant", priority: "asap" },
      ],
      map,
    );
    expect(review.comments).toHaveLength(2);
    expect(review.comments[0]?.id).toBe("cmt_001");
    expect(review.comments[0]?.category).toBe("change-request");
    expect(review.comments[1]?.category).toBeUndefined();
    expect(review.comments[1]?.priority).toBeUndefined();
  });

  it("ids jdou v pořadí první editace prvku a výstup projde validací", () => {
    const review = compileReview(
      [
        edit("cx-2", "Odstavec", "Věta"),
        { type: "comment", cxId: "cx-1", text: "Pěkné." },
        edit("cx-1", "Naše služby", "Služby"),
        edit("cx-2", "Věta", "Souvětí"),
      ],
      map,
    );
    expect(review.changes.map((change) => [change.id, change.target.cxId])).toEqual([
      ["chg_001", "cx-2"],
      ["chg_002", "cx-1"],
    ]);
    expect(() => validateReview(review)).not.toThrow();
  });

  it("meta se přenese a doplní compiledAt", () => {
    const review = compileReview([], map, {
      meta: { source: "demo.html" },
      now: new Date("2026-09-01T10:00:00Z"),
    });
    expect(review.meta?.source).toBe("demo.html");
    expect(review.meta?.compiledAt).toBe("2026-09-01T10:00:00.000Z");
  });
});

describe("renderReviewMarkdown", () => {
  it("shrne změny i komentáře čitelně", () => {
    const review = compileReview(
      [edit("cx-1", "Naše služby", "Služby"), { type: "comment", cxId: "cx-2", text: "Menší." }],
      map,
    );
    const markdown = renderReviewMarkdown(review);
    expect(markdown).toContain("# Review");
    expect(markdown).toContain("chg_001");
    expect(markdown).toContain("Naše služby");
    expect(markdown).toContain("Služby");
    expect(markdown).toContain("cmt_001");
    expect(markdown).toContain("Menší.");
  });

  it("prázdné review řekne, že nic nepřišlo", () => {
    const markdown = renderReviewMarkdown(compileReview([], map));
    expect(markdown).toContain("# Review");
    expect(markdown).toMatch(/[Žž]ádné/);
  });
});

describe("blokové změny (#57)", () => {
  const subtree = { tag: "section", elements: 5, textFingerprint: "Sekce s kartami" };

  it("hide a remove projdou do výstupu se správným targetem a podstromem", () => {
    const review = compileReview(
      [
        { type: "hide", cxId: "cx-1", subtree },
        { type: "remove", cxId: "cx-2", subtree },
      ],
      map,
    );
    expect(review.changes).toHaveLength(2);
    expect(review.changes[0]).toMatchObject({ type: "hide", target: { cxId: "cx-1" } });
    expect(review.changes[1]).toMatchObject({
      type: "remove",
      subtree: { tag: "section", elements: 5 },
    });
    expect(() => validateReview(review)).not.toThrow();
  });

  it("remove téhož prvku vytlačí dřívější hide i textovou editaci", () => {
    const review = compileReview(
      [
        edit("cx-1", "Odstavec", "Věta"),
        { type: "hide", cxId: "cx-1", subtree },
        { type: "remove", cxId: "cx-1", subtree },
      ],
      map,
    );
    expect(review.changes).toHaveLength(1);
    expect(review.changes[0]?.type).toBe("remove");
  });

  it("dvojí remove téhož prvku je jedna změna", () => {
    const review = compileReview(
      [
        { type: "remove", cxId: "cx-1", subtree },
        { type: "remove", cxId: "cx-1", subtree },
      ],
      map,
    );
    expect(review.changes).toHaveLength(1);
  });

  it("review.md rozliší hypotézu od pokynu", () => {
    const markdown = renderReviewMarkdown(
      compileReview(
        [
          { type: "hide", cxId: "cx-1", subtree },
          { type: "remove", cxId: "cx-2", subtree },
        ],
        map,
      ),
    );
    expect(markdown).toMatch(/skrýt|hypotéza/i);
    expect(markdown).toMatch(/smazat|odstranit/i);
    expect(markdown).toContain("5 prvků");
  });
});

describe("skládání hide + edit (#57 review)", () => {
  const subtree = { tag: "p", elements: 1, textFingerprint: "Odstavec" };

  it("hide a editace téhož prvku dají dvě změny — edit před blokem, ids drží pořadí", () => {
    const review = compileReview(
      [
        edit("cx-1", "Odstavec", "Věta"),
        { type: "hide", cxId: "cx-1", subtree },
        edit("cx-2", "Naše služby", "Služby"),
      ],
      map,
    );
    expect(review.changes.map((change) => [change.id, change.type, change.target.cxId])).toEqual([
      ["chg_001", "text", "cx-1"],
      ["chg_002", "hide", "cx-1"],
      ["chg_003", "text", "cx-2"],
    ]);
  });
});

describe("duplikace (#58)", () => {
  it("duplicate projde do výstupu s targetem originálu a mapováním", () => {
    const review = compileReview(
      [{ type: "duplicate", cxId: "cx-1", mapping: { "cx-1": "cx-d1" } }],
      map,
    );
    expect(review.changes[0]).toMatchObject({
      type: "duplicate",
      target: { cxId: "cx-1" },
      mapping: { "cx-1": "cx-d1" },
    });
    expect(() => validateReview(review)).not.toThrow();
  });

  it("dva duplikáty téhož prvku jsou dvě změny — chci jich víc, ne jednu", () => {
    const review = compileReview(
      [
        { type: "duplicate", cxId: "cx-1", mapping: { "cx-1": "cx-d1" } },
        { type: "duplicate", cxId: "cx-1", mapping: { "cx-1": "cx-d2" } },
      ],
      map,
    );
    expect(review.changes).toHaveLength(2);
  });

  it("edit v duplikátu = samostatná změna se syntetickým cílem (test z PRD)", () => {
    const review = compileReview(
      [
        { type: "duplicate", cxId: "cx-1", mapping: { "cx-1": "cx-d1" } },
        edit("cx-d1", "Odstavec", "Odstavec jinak"),
      ],
      map,
    );
    expect(review.changes).toHaveLength(2);
    expect(review.changes.map((change) => [change.type, change.target.cxId])).toEqual([
      ["duplicate", "cx-1"],
      ["text", "cx-d1"],
    ]);
  });

  it("review.md duplikaci vypíše čitelně", () => {
    const markdown = renderReviewMarkdown(
      compileReview([{ type: "duplicate", cxId: "cx-1", mapping: { "cx-1": "cx-d1" } }], map),
    );
    expect(markdown).toMatch(/duplikovat/i);
  });
});

describe("duplikace — hijack guard (#58 review)", () => {
  it("mapping hodnota kolidující s reálným cx-id se odfiltruje", () => {
    const review = compileReview(
      [{ type: "duplicate", cxId: "cx-1", mapping: { "cx-1": "cx-2", "cx-9": "cx-d1" } }],
      map,
    );
    const change = review.changes[0];
    expect(change !== undefined && "mapping" in change ? change.mapping : {}).toEqual({
      "cx-9": "cx-d1",
    });
  });

  it("mapping složený jen z kolizí celou duplikaci zahodí", () => {
    const review = compileReview(
      [{ type: "duplicate", cxId: "cx-1", mapping: { "cx-1": "cx-2" } }],
      map,
    );
    expect(review.changes).toEqual([]);
  });
});

describe("undo, redo a zahození (#59)", () => {
  const treeMap: LocationMap = {
    "cx-8": {
      selector: "html:nth-child(1) > body:nth-child(2) > section:nth-child(1)",
      hostPath: [],
      textFingerprint: "Naše služby Odstavec",
    },
    "cx-0": {
      selector: "html:nth-child(1) > body:nth-child(2) > section:nth-child(1) > h1:nth-child(1)",
      hostPath: [],
      textFingerprint: "Naše služby",
    },
    "cx-1": {
      selector: "html:nth-child(1) > body:nth-child(2) > p:nth-child(2)",
      hostPath: [],
      textFingerprint: "Odstavec",
    },
  };
  const act = (id: string) => ({ actionId: id });

  it("undo poslední změny → změna ve výstupu není", () => {
    const review = compileReview(
      [
        { ...edit("cx-1", "Odstavec", "Věta"), ...act("a1") },
        { type: "revoke", actionId: "a1" },
      ],
      treeMap,
    );
    expect(review.changes).toEqual([]);
  });

  it("undo následované redo → změna ve výstupu je", () => {
    const review = compileReview(
      [
        { ...edit("cx-1", "Odstavec", "Věta"), ...act("a1") },
        { type: "revoke", actionId: "a1" },
        { type: "restore", actionId: "a1" },
      ],
      treeMap,
    );
    expect(review.changes).toHaveLength(1);
  });

  it("zahození prostřední položky → ostatní zůstanou, pořadí se nerozpadne", () => {
    const subtree = { tag: "h1", elements: 1, textFingerprint: "Naše služby" };
    const review = compileReview(
      [
        { ...edit("cx-1", "Odstavec", "Věta"), ...act("a1") },
        { type: "hide", cxId: "cx-0", subtree, actionId: "a2" },
        { type: "comment", cxId: "cx-8", text: "Poznámka.", actionId: "a3" },
        { type: "revoke", actionId: "a2" },
      ],
      treeMap,
    );
    expect(review.changes.map((change) => [change.type, change.target.cxId])).toEqual([
      ["text", "cx-1"],
    ]);
    expect(review.comments).toHaveLength(1);
  });

  it("revokovaný komentář ve výstupu není", () => {
    const review = compileReview(
      [
        { type: "comment", cxId: "cx-1", text: "Smazat.", actionId: "a1" },
        { type: "revoke", actionId: "a1" },
      ],
      treeMap,
    );
    expect(review.comments).toEqual([]);
  });

  it("smazání rodiče po editaci potomka → edit potomka se nepropaguje (test z PRD)", () => {
    const subtree = { tag: "section", elements: 3, textFingerprint: "Naše služby Odstavec" };
    const review = compileReview(
      [edit("cx-0", "Naše služby", "Služby"), { type: "remove", cxId: "cx-8", subtree }],
      treeMap,
    );
    expect(review.changes).toHaveLength(1);
    expect(review.changes[0]?.type).toBe("remove");
  });

  it("edit sourozence smazaného prvku zůstává — prořezává se jen podstrom", () => {
    const subtree = { tag: "section", elements: 3, textFingerprint: "Naše služby Odstavec" };
    const review = compileReview(
      [edit("cx-1", "Odstavec", "Věta"), { type: "remove", cxId: "cx-8", subtree }],
      treeMap,
    );
    expect(review.changes.map((change) => change.type).sort()).toEqual(["remove", "text"]);
  });
});

describe("kaskáda a vnořené removes (#59 review)", () => {
  it("revoke obou editací téhož prvku → žádná změna, before z půlky historie neexistuje", () => {
    const review = compileReview(
      [
        { ...edit("cx-1", "X", "Y"), actionId: "a1" },
        { ...edit("cx-1", "Y", "Z"), actionId: "a2" },
        { type: "revoke", actionId: "a2" },
        { type: "revoke", actionId: "a1" },
      ],
      map,
    );
    expect(review.changes).toEqual([]);
  });

  it("vnořené removes zůstávají obě — každý kořen nese vlastní subtree záměrně", () => {
    const treeMap: LocationMap = {
      "cx-8": {
        selector: "html:nth-child(1) > body:nth-child(2) > section:nth-child(1)",
        hostPath: [],
        textFingerprint: "Sekce",
      },
      "cx-0": {
        selector: "html:nth-child(1) > body:nth-child(2) > section:nth-child(1) > h1:nth-child(1)",
        hostPath: [],
        textFingerprint: "Nadpis",
      },
    };
    const review = compileReview(
      [
        {
          type: "remove",
          cxId: "cx-0",
          subtree: { tag: "h1", elements: 1, textFingerprint: "Nadpis" },
        },
        {
          type: "remove",
          cxId: "cx-8",
          subtree: { tag: "section", elements: 3, textFingerprint: "Sekce" },
        },
      ],
      treeMap,
    );
    // Agent vidí oba explicitní pokyny; dedup by ztratil vyslovený záměr.
    expect(review.changes.filter((change) => change.type === "remove")).toHaveLength(2);
  });
});
