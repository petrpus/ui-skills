import { describe, expect, it } from "vitest";
import { parseEventLog } from "../src/events.ts";

const edit = { type: "text-edit", cxId: "cx-1", before: "A", after: "B" };
const comment = { type: "comment", cxId: "cx-2", text: "Menší." };

function log(...entries: unknown[]): string {
  return entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
}

describe("parseEventLog", () => {
  it("přečte editace a komentáře v pořadí zápisu", () => {
    const { events, warnings } = parseEventLog(log(edit, comment));
    expect(events).toEqual([edit, comment]);
    expect(warnings).toEqual([]);
  });

  it("prázdný log → žádné události, žádná varování", () => {
    expect(parseEventLog("")).toEqual({ events: [], warnings: [] });
  });

  it("useknutý poslední řádek přeskočí s varováním a zbytek přečte", () => {
    const raw = `${log(edit, comment)}{"type":"text-edit","cxId":"cx-3","befo`;
    const { events, warnings } = parseEventLog(raw);
    expect(events).toEqual([edit, comment]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/useknut/);
  });

  it("neplatný řádek uprostřed přeskočí s varováním", () => {
    const raw = `${JSON.stringify(edit)}\nrozbité\n${JSON.stringify(comment)}\n`;
    const { events, warnings } = parseEventLog(raw);
    expect(events).toEqual([edit, comment]);
    expect(warnings).toHaveLength(1);
  });

  it("událost neznámého typu přeskočí s varováním, neshodí se", () => {
    const raw = log(edit, { type: "resize", cxId: "cx-9" }, comment);
    const { events, warnings } = parseEventLog(raw);
    expect(events).toEqual([edit, comment]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/resize/);
  });

  it("editaci bez povinných polí přeskočí s varováním", () => {
    const raw = log({ type: "text-edit", cxId: "cx-1", before: "A" });
    const { events, warnings } = parseEventLog(raw);
    expect(events).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("komentář s prázdným textem přeskočí s varováním", () => {
    const raw = log({ type: "comment", cxId: "cx-1", text: "   " });
    const { events, warnings } = parseEventLog(raw);
    expect(events).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("komentář s kategorií a prioritou projde i s neznámou hodnotou kategorie", () => {
    // The log is an append-only record of what the editor sent; filtering
    // beyond structure belongs to compilation, which validates the output.
    const raw = log({ ...comment, category: "change-request", priority: "high" });
    const { events } = parseEventLog(raw);
    expect(events).toHaveLength(1);
  });

  it("prázdné řádky ignoruje bez varování", () => {
    const { events, warnings } = parseEventLog(`\n${JSON.stringify(edit)}\n\n`);
    expect(events).toEqual([edit]);
    expect(warnings).toEqual([]);
  });
});

describe("blokové události (#57)", () => {
  const subtree = { tag: "section", elements: 3, textFingerprint: "Obsah" };

  it("hide a remove se přečtou včetně podstromu", () => {
    const raw = log(
      { type: "hide", cxId: "cx-1", subtree },
      { type: "remove", cxId: "cx-2", subtree },
    );
    const { events, warnings } = parseEventLog(raw);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "hide", cxId: "cx-1" });
    expect(events[1]).toMatchObject({ type: "remove", subtree: { elements: 3 } });
    expect(warnings).toEqual([]);
  });

  it("bloková událost bez podstromu se přeskočí s varováním", () => {
    const { events, warnings } = parseEventLog(log({ type: "remove", cxId: "cx-1" }));
    expect(events).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});

describe("duplicate událost (#58)", () => {
  it("přečte se s mapováním", () => {
    const { events, warnings } = parseEventLog(
      log({ type: "duplicate", cxId: "cx-1", mapping: { "cx-1": "cx-d1" } }),
    );
    expect(events[0]).toMatchObject({ type: "duplicate", mapping: { "cx-1": "cx-d1" } });
    expect(warnings).toEqual([]);
  });

  it("bez mapování se přeskočí s varováním", () => {
    const { events, warnings } = parseEventLog(log({ type: "duplicate", cxId: "cx-1" }));
    expect(events).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});
