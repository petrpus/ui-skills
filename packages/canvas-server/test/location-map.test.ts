import { describe, expect, it } from "vitest";
import { parseLocationMap } from "../src/location-map.ts";

const valid = {
  "cx-0": {
    selector: "h1:nth-child(1)",
    hostPath: [],
    xpath: "/html[1]/body[1]/h1[1]",
    textFingerprint: "Ahoj",
  },
};

describe("parseLocationMap", () => {
  it("přijme mapu, jak ji píše canvas-snapshot", () => {
    expect(parseLocationMap(JSON.stringify(valid))).toEqual(valid);
  });

  it("prázdná mapa projde", () => {
    expect(parseLocationMap("{}")).toEqual({});
  });

  it("neplatný JSON selže s hlášením o map.json", () => {
    expect(() => parseLocationMap("{rozbité")).toThrow(/map\.json/);
  });

  it("záznam bez selektoru selže a jmenuje cx-id", () => {
    expect(() => parseLocationMap('{"cx-3":{"hostPath":[],"textFingerprint":""}}')).toThrow(
      /cx-3.*selector/,
    );
  });

  it("hostPath jiného tvaru než pole řetězců selže", () => {
    expect(() =>
      parseLocationMap('{"cx-1":{"selector":"p","hostPath":"div","textFingerprint":""}}'),
    ).toThrow(/hostPath/);
  });
});
