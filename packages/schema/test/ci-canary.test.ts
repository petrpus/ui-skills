import { describe, expect, it } from "vitest";

describe("dočasná kanárka", () => {
  it("selže schválně, aby se ověřilo, že CI červený verify shodí", () => {
    expect(1).toBe(2);
  });
});
