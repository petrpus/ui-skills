import { REVIEW_SCHEMA_VERSION, type Review } from "@ui-skills/schema";
import { describe, expect, it } from "vitest";
import { applyReview } from "../src/apply.ts";
import type { SourceFile } from "../src/map.ts";

function review(partial: Partial<Review>): Review {
  return { schemaVersion: REVIEW_SCHEMA_VERSION, changes: [], comments: [], ...partial };
}

function textChange(
  id: string,
  before: string,
  after: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    target: { cxId: `cx-${id}`, textFingerprint: before, ...extra },
    type: "text" as const,
    before,
    after,
  };
}

const component: SourceFile = {
  path: "src/Services.tsx",
  content: "<h2>Naše služby</h2>\n<p>Popis služeb.</p>\n",
};

describe("applyReview", () => {
  it("jednoznačný nález se přepíše 1:1 a skončí jako applied", () => {
    const result = applyReview(
      review({ changes: [textChange("chg_001", "Naše služby", "Co umíme")] }),
      [component],
    );
    expect(result.changes[0]).toMatchObject({
      id: "chg_001",
      status: "applied",
      location: "src/Services.tsx:1",
    });
    expect(result.updates.get("src/Services.tsx")).toContain("<h2>Co umíme</h2>");
    expect(result.ratio).toEqual({ applied: 1, needsInput: 0, skipped: 0 });
  });

  it("nejednoznačný nález končí jako needs-input a nic se nemění", () => {
    const clone: SourceFile = { path: "src/Footer.tsx", content: "<span>Naše služby</span>\n" };
    const result = applyReview(
      review({ changes: [textChange("chg_001", "Naše služby", "Co umíme")] }),
      [component, clone],
    );
    expect(result.changes[0]?.status).toBe("needs-input");
    expect(result.changes[0]?.note).toMatch(/2 souborech/);
    expect(result.updates.size).toBe(0);
  });

  it("nález v překladovém souboru se ohlásí jako překlad, ne tichý zápis do komponenty", () => {
    const translation: SourceFile = {
      path: "locales/cs.json",
      content: '{ "title": "Jenom v překladu" }\n',
    };
    const result = applyReview(
      review({ changes: [textChange("chg_001", "Jenom v překladu", "Nový titulek")] }),
      [component, translation],
    );
    expect(result.changes[0]?.status).toBe("applied");
    expect(result.changes[0]?.note).toMatch(/překlad/i);
    expect(result.updates.get("locales/cs.json")).toContain("Nový titulek");
  });

  it("před-text chybí, ale po-text už na místě je → skipped, ne needs-input", () => {
    const result = applyReview(
      review({ changes: [textChange("chg_001", "Stará verze", "Popis služeb.")] }),
      [component],
    );
    expect(result.changes[0]?.status).toBe("skipped");
    expect(result.changes[0]?.note).toMatch(/už/);
  });

  it("nenalezený text končí jako needs-input s vysvětlením", () => {
    const result = applyReview(
      review({ changes: [textChange("chg_001", "Nikde nic", "Cokoli")] }),
      [component],
    );
    expect(result.changes[0]?.status).toBe("needs-input");
    expect(result.changes[0]?.note).toMatch(/nebyl.*nalezen/);
  });

  it("dvě změny v témže souboru se aplikují postupně obě", () => {
    const result = applyReview(
      review({
        changes: [
          textChange("chg_001", "Naše služby", "Co umíme"),
          textChange("chg_002", "Popis služeb.", "Detailní popis."),
        ],
      }),
      [component],
    );
    expect(result.ratio).toEqual({ applied: 2, needsInput: 0, skipped: 0 });
    const updated = result.updates.get("src/Services.tsx");
    expect(updated).toContain("Co umíme");
    expect(updated).toContain("Detailní popis.");
  });

  it("sourceHint na soubor, kde text není a po-text taky ne → needs-input", () => {
    const result = applyReview(
      review({
        changes: [
          textChange("chg_001", "Neexistuje tu", "Ani tohle", {
            sourceHint: "src/Services.tsx:1",
          }),
        ],
      }),
      [component],
    );
    expect(result.changes[0]?.status).toBe("needs-input");
    expect(result.changes[0]?.note).toMatch(/sourceHint/);
  });

  it("komentář kategorie question se zodpovídá, ne edituje; ostatní jdou do plánu", () => {
    const result = applyReview(
      review({
        comments: [
          {
            id: "cmt_001",
            target: { cxId: "cx-1", textFingerprint: "Naše služby" },
            text: "Proč je to modré?",
            category: "question" as const,
          },
          {
            id: "cmt_002",
            target: { cxId: "cx-2", textFingerprint: "Popis služeb." },
            text: "Celé přepracovat.",
            category: "change-request" as const,
          },
        ],
      }),
      [component],
    );
    expect(result.updates.size).toBe(0);
    expect(result.comments[0]).toMatchObject({ id: "cmt_001", action: "odpovědět" });
    expect(result.comments[1]).toMatchObject({
      id: "cmt_002",
      action: "rozpadnout na plán",
      location: "src/Services.tsx:2",
    });
  });
});

describe("applyReview — nálezy z review", () => {
  it("prázdný before (vkládání) končí jako needs-input, nevkládá se na slepo", () => {
    const result = applyReview(
      review({
        changes: [textChange("chg_001", "", "Nový odstavec", { textFingerprint: "Naše služby" })],
      }),
      [component],
    );
    expect(result.changes[0]?.status).toBe("needs-input");
    expect(result.changes[0]?.note).toMatch(/kotv/);
    expect(result.updates.size).toBe(0);
  });
});

describe("blokové změny a neznámé typy (#57)", () => {
  const subtree = { tag: "section", elements: 4, textFingerprint: "Naše služby" };

  it("hide končí jako podklad pro plán, ne editace", () => {
    const result = applyReview(
      review({
        changes: [
          {
            id: "chg_001",
            target: { cxId: "cx-1", textFingerprint: "Naše služby" },
            type: "hide",
            subtree,
          },
        ],
      }),
      [component],
    );
    expect(result.changes[0]).toMatchObject({ status: "needs-input" });
    expect(result.changes[0]?.note).toMatch(/hypotéza/);
    expect(result.updates.size).toBe(0);
  });

  it("remove se namapuje a nese rozsah — provádí agent, ne CLI", () => {
    const result = applyReview(
      review({
        changes: [
          {
            id: "chg_001",
            target: { cxId: "cx-1", textFingerprint: "Naše služby" },
            type: "remove",
            subtree,
          },
        ],
      }),
      [component],
    );
    expect(result.changes[0]).toMatchObject({
      status: "needs-input",
      location: "src/Services.tsx:1",
    });
    expect(result.changes[0]?.note).toMatch(/4 prvků/);
    expect(result.updates.size).toBe(0);
  });

  it("neznámý typ skončí jako skipped s poznámkou, nespadne", () => {
    const result = applyReview(
      review({
        changes: [{ id: "chg_001", target: { cxId: "cx-9" }, type: "style", raw: { props: {} } }],
      }),
      [component],
    );
    expect(result.changes[0]).toMatchObject({ status: "skipped" });
    expect(result.changes[0]?.note).toMatch(/neznámý typ/);
    expect(result.ratio.skipped).toBe(1);
  });
});

describe("duplikace (#58)", () => {
  const duplicate = {
    id: "chg_001",
    target: { cxId: "cx-1", textFingerprint: "Naše služby" },
    type: "duplicate" as const,
    mapping: { "cx-1": "cx-d1" },
  };

  it("duplicate se namapuje přes originál a provádí ho agent", () => {
    const result = applyReview(review({ changes: [duplicate] }), [component]);
    expect(result.changes[0]).toMatchObject({
      status: "needs-input",
      location: "src/Services.tsx:1",
    });
    expect(result.changes[0]?.note).toMatch(/duplik/i);
    expect(result.updates.size).toBe(0);
  });

  it("edit se syntetickým cílem se NIKDY neaplikuje na originální výskyt", () => {
    const result = applyReview(
      review({
        changes: [
          duplicate,
          {
            id: "chg_002",
            target: { cxId: "cx-d1" },
            type: "text" as const,
            before: "Naše služby",
            after: "Vaše služby",
          },
        ],
      }),
      [component],
    );
    const editRow = result.changes[1];
    expect(editRow?.status).toBe("needs-input");
    expect(editRow?.note).toMatch(/duplik/i);
    expect(editRow?.note).toContain("chg_001");
    // Zdroj zůstal netknutý — text originálu se nesmí přepsat.
    expect(result.updates.size).toBe(0);
  });

  it("edit se syntetickým cílem nese lokaci originálu jako vodítko", () => {
    const result = applyReview(
      review({
        changes: [
          duplicate,
          {
            id: "chg_002",
            target: { cxId: "cx-d1" },
            type: "text" as const,
            before: "Naše služby",
            after: "Vaše služby",
          },
        ],
      }),
      [component],
    );
    expect(result.changes[1]?.location).toBe("src/Services.tsx:1");
  });
});
