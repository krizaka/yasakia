import { describe, expect, it } from "vitest";

import { openJson } from "./crypto";
import { facetContext, facetRow } from "./facets";

describe("the facets door", () => {
  it("seals a sensitive facet and keeps nothing in clear", () => {
    const row = facetRow("acc-1", { key: "children", value: { wants: "no" }, sensitive: true, confidence: 0.8 });
    expect(row.value).toBeNull();
    expect(row.valueSealed).toMatch(/^enc:v1:/);
    expect(openJson(row.valueSealed!, facetContext("acc-1", "children"))).toEqual({ wants: "no" });
  });

  it("keeps a non-sensitive facet in clear, and clamps the confidence to 0..1", () => {
    const row = facetRow("acc-1", { key: "humour", value: "dry", sensitive: false, confidence: 3 });
    expect(row).toMatchObject({ value: "dry", valueSealed: null, confidence: 1 });
  });

  it("a sealed facet cannot be moved to another account or key", () => {
    const row = facetRow("acc-1", { key: "children", value: "no", sensitive: true, confidence: 1 });
    expect(() => openJson(row.valueSealed!, facetContext("acc-2", "children"))).toThrow();
    expect(() => openJson(row.valueSealed!, facetContext("acc-1", "smoking"))).toThrow();
  });
});
