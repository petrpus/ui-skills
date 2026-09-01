import { describe, expect, it } from "vitest";
import {
  type CdpNode,
  countClosedShadowRoots,
  reportClosedShadowRoots,
} from "../src/shadow-probe.ts";

function node(partial: Partial<CdpNode> = {}): CdpNode {
  return { nodeName: "DIV", ...partial };
}

describe("countClosedShadowRoots", () => {
  it("prázdný strom → nula", () => {
    expect(countClosedShadowRoots(node())).toBe(0);
  });

  it("otevřený root se nepočítá, zavřený ano", () => {
    const tree = node({
      children: [
        node({ shadowRoots: [node({ shadowRootType: "open" })] }),
        node({ shadowRoots: [node({ shadowRootType: "closed" })] }),
      ],
    });
    expect(countClosedShadowRoots(tree)).toBe(1);
  });

  it("user-agent rooty (vestavěné prvky prohlížeče) se nepočítají", () => {
    const tree = node({
      children: [node({ shadowRoots: [node({ shadowRootType: "user-agent" })] })],
    });
    expect(countClosedShadowRoots(tree)).toBe(0);
  });

  it("počítá i zavřený root zanořený uvnitř otevřeného", () => {
    const tree = node({
      shadowRoots: [
        node({
          shadowRootType: "open",
          children: [node({ shadowRoots: [node({ shadowRootType: "closed" })] })],
        }),
      ],
    });
    expect(countClosedShadowRoots(tree)).toBe(1);
  });

  it("projde i obsah template (contentDocument fragmenty CDP)", () => {
    const tree = node({
      children: [
        node({
          nodeName: "TEMPLATE",
          templateContent: node({
            children: [node({ shadowRoots: [node({ shadowRootType: "closed" })] })],
          }),
        }),
      ],
    });
    expect(countClosedShadowRoots(tree)).toBe(1);
  });

  it("dva zavřené rooty → dva", () => {
    const tree = node({
      children: [
        node({ shadowRoots: [node({ shadowRootType: "closed" })] }),
        node({ shadowRoots: [node({ shadowRootType: "closed" })] }),
      ],
    });
    expect(countClosedShadowRoots(tree)).toBe(2);
  });
});

describe("reportClosedShadowRoots", () => {
  it("nula rootů → žádná hláška", async () => {
    expect(await reportClosedShadowRoots("http://x", async () => 0)).toBeNull();
  });

  it("nález → varování o chybějícím obsahu", async () => {
    const report = await reportClosedShadowRoots("http://x", async () => 2);
    expect(report).toMatch(/2 zavřených/);
    expect(report).toMatch(/chybí/);
  });

  it("selhání proby nevyhazuje — pojmenuje se, nesmí shodit doručený snapshot", async () => {
    const report = await reportClosedShadowRoots("http://x", async () => {
      throw new Error("prohlížeč nenastartoval");
    });
    expect(report).toMatch(/se nepodařilo ověřit/);
    expect(report).toContain("prohlížeč nenastartoval");
  });
});
