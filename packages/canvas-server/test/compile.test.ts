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
    expect(change?.before).toBe("Naše služby");
    expect(change?.after).toBe("Služby");
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
    expect(review.changes[0]?.before).toBe("Naše služby");
    expect(review.changes[0]?.after).toBe("Co umíme");
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
