import { REVIEW_SCHEMA_VERSION } from "@ui-skills/schema";
import { describe, expect, it } from "vitest";
import { applyReview } from "../src/apply.ts";
import { renderAppliedMarkdown } from "../src/report.ts";

describe("renderAppliedMarkdown", () => {
  it("obsahuje tabulku změn, komentáře i poměr", () => {
    const result = applyReview(
      {
        schemaVersion: REVIEW_SCHEMA_VERSION,
        changes: [
          {
            id: "chg_001",
            target: { cxId: "cx-1", textFingerprint: "Ahoj" },
            type: "text",
            before: "Ahoj",
            after: "Nazdar",
          },
          {
            id: "chg_002",
            target: { cxId: "cx-2", textFingerprint: "Nikde" },
            type: "text",
            before: "Nikde",
            after: "Jinde",
          },
        ],
        comments: [
          {
            id: "cmt_001",
            target: { cxId: "cx-1" },
            text: "Proč?",
            category: "question",
          },
        ],
      },
      [{ path: "src/a.tsx", content: "<h1>Ahoj</h1>\n" }],
    );

    const markdown = renderAppliedMarkdown(result, "/tmp/review.json");
    expect(markdown).toContain("| změna | soubor:řádek | stav | poznámka |");
    expect(markdown).toContain("| chg_001 | `src/a.tsx:1` | applied |");
    expect(markdown).toContain("| chg_002 | — | needs-input |");
    expect(markdown).toContain("| cmt_001 | question | — | — | odpovědět | Proč? |");
    expect(markdown).toContain("applied 1 / needs-input 1 / skipped 0 (50 % applied)");
  });

  it("prázdné review vypíše smysluplný report bez tabulek", () => {
    const result = applyReview(
      { schemaVersion: REVIEW_SCHEMA_VERSION, changes: [], comments: [] },
      [],
    );
    const markdown = renderAppliedMarkdown(result, "r.json");
    expect(markdown).toContain("Žádné přímé editace.");
    expect(markdown).toContain("applied 0 / needs-input 0 / skipped 0 (—)");
  });
});
