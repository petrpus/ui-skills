import { describe, expect, it } from "vitest";
import { REVIEW_SCHEMA_VERSION, ReviewError, validateReview } from "../src/index.ts";

const change = {
  id: "chg_001",
  target: {
    cxId: "cx-142",
    selector: "main > section:nth-child(2) h2",
    textFingerprint: "Naše služby",
  },
  type: "text",
  before: "Naše služby",
  after: "Co pro vás uděláme",
};

const comment = {
  id: "cmt_001",
  target: { cxId: "cx-7" },
  category: "change-request",
  priority: "high",
  text: "Celý hero přepracovat — méně textu, jedno CTA.",
};

function validDocument(): Record<string, unknown> {
  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    meta: { compiledAt: "2026-09-01T10:00:00.000Z" },
    changes: [change],
    comments: [comment],
  };
}

describe("validateReview", () => {
  it("přijme platný dokument", () => {
    const review = validateReview(validDocument());
    expect(review.changes).toHaveLength(1);
    const first = review.changes[0];
    expect(first !== undefined && "after" in first ? first.after : "").toBe("Co pro vás uděláme");
    expect(review.comments[0]?.category).toBe("change-request");
  });

  it("přijme prázdné review", () => {
    const review = validateReview({
      schemaVersion: REVIEW_SCHEMA_VERSION,
      changes: [],
      comments: [],
    });
    expect(review.changes).toEqual([]);
    expect(review.comments).toEqual([]);
  });

  it("odmítne chybějící schemaVersion", () => {
    const doc = validDocument();
    delete doc.schemaVersion;
    expect(() => validateReview(doc)).toThrow(ReviewError);
    expect(() => validateReview(doc)).toThrow(/schemaVersion/);
  });

  it("odmítne neznámou schemaVersion s vysvětlením, nehádá", () => {
    expect(() => validateReview({ ...validDocument(), schemaVersion: 99 })).toThrow(
      /nepodporovaná schemaVersion 99/,
    );
  });

  it("odmítne změnu bez typu — dopředná kompatibilita neznamená beztvarost", () => {
    const doc = validDocument();
    doc.changes = [{ id: "chg_001", target: { cxId: "cx-1" }, before: "a", after: "b" }];
    expect(() => validateReview(doc)).toThrow(/type/);
  });

  it("odmítne změnu bez before/after", () => {
    const doc = validDocument();
    doc.changes = [{ id: "chg_001", target: { cxId: "cx-1" }, type: "text", before: "a" }];
    expect(() => validateReview(doc)).toThrow(ReviewError);
  });

  it("odmítne target bez cxId", () => {
    const doc = validDocument();
    doc.changes = [{ ...change, target: { selector: "div" } }];
    expect(() => validateReview(doc)).toThrow(/cxId/);
  });

  it("odmítne komentář s prázdným textem", () => {
    const doc = validDocument();
    doc.comments = [{ ...comment, text: "  " }];
    expect(() => validateReview(doc)).toThrow(ReviewError);
  });

  it("odmítne neznámou kategorii komentáře", () => {
    const doc = validDocument();
    doc.comments = [{ ...comment, category: "rant" }];
    expect(() => validateReview(doc)).toThrow(/kategorie/);
  });

  it("odmítne chybějící pole changes", () => {
    const doc = validDocument();
    delete doc.changes;
    expect(() => validateReview(doc)).toThrow(/changes/);
  });

  it("hostPath v targetu musí být pole řetězců", () => {
    const doc = validDocument();
    doc.changes = [{ ...change, target: { cxId: "cx-1", hostPath: "div" } }];
    expect(() => validateReview(doc)).toThrow(/hostPath/);
  });

  it("hlásí cestu k vadnému místu", () => {
    const doc = validDocument();
    doc.comments = [{ ...comment, priority: "urgent" }];
    try {
      validateReview(doc);
      expect.unreachable("mělo odmítnout");
    } catch (error) {
      expect((error as ReviewError).path).toBe("comments[0]");
    }
  });
});

describe("blokové změny a dopředná kompatibilita (#57)", () => {
  const subtree = { tag: "section", elements: 12, textFingerprint: "Naše služby Popis" };

  it("hide a remove nesou popis podstromu", () => {
    const review = validateReview({
      schemaVersion: REVIEW_SCHEMA_VERSION,
      changes: [
        { id: "chg_001", target: { cxId: "cx-1" }, type: "hide", subtree },
        { id: "chg_002", target: { cxId: "cx-2" }, type: "remove", subtree },
      ],
      comments: [],
    });
    expect(review.changes).toHaveLength(2);
    const removal = review.changes[1];
    expect(removal?.type).toBe("remove");
    expect(removal !== undefined && "subtree" in removal ? removal.subtree.elements : 0).toBe(12);
  });

  it("remove bez podstromu se odmítne — agent potřebuje rozsah", () => {
    expect(() =>
      validateReview({
        schemaVersion: REVIEW_SCHEMA_VERSION,
        changes: [{ id: "chg_001", target: { cxId: "cx-1" }, type: "remove" }],
        comments: [],
      }),
    ).toThrow(/subtree/);
  });

  it("podstrom s nesmyslným počtem prvků se odmítne", () => {
    expect(() =>
      validateReview({
        schemaVersion: REVIEW_SCHEMA_VERSION,
        changes: [
          {
            id: "chg_001",
            target: { cxId: "cx-1" },
            type: "hide",
            subtree: { tag: "div", elements: -1, textFingerprint: "" },
          },
        ],
        comments: [],
      }),
    ).toThrow(/elements/);
  });

  it("neznámý typ změny projde jako unknown se zachovanými daty — apply ho přeskočí, nespadne", () => {
    const review = validateReview({
      schemaVersion: REVIEW_SCHEMA_VERSION,
      changes: [
        {
          id: "chg_001",
          target: { cxId: "cx-1" },
          type: "style",
          props: { color: { before: "#fff", after: "#000" } },
        },
      ],
      comments: [],
    });
    const change = review.changes[0];
    expect(change?.type).toBe("style");
    expect(
      change && "raw" in change ? (change.raw as { props?: unknown }).props : undefined,
    ).toBeDefined();
  });

  it("neznámý typ pořád vyžaduje id a target s cxId", () => {
    expect(() =>
      validateReview({
        schemaVersion: REVIEW_SCHEMA_VERSION,
        changes: [{ id: "chg_001", type: "style" }],
        comments: [],
      }),
    ).toThrow(ReviewError);
  });
});
