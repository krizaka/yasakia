import { Extraction } from "@yasakia/ai";
import { describe, expect, it } from "vitest";

import { basicsFrom, estimateTokens, missingBasics, readiness, REQUIRED_BASICS } from "./agent-rules";
import type { AgentParams } from "./rule-sets";

const params: AgentParams = { minUserTurns: 5, historyMessages: 40, messageMaxChars: 1500, requiredFacets: ["story", "seeking"], minFacets: 4 };
const ex = (value: unknown) => Extraction.parse(value);

describe("missingBasics", () => {
  it("lists what has not been said, in order", () => {
    expect(missingBasics([])).toEqual([...REQUIRED_BASICS]);
    expect(missingBasics(["gender", "intent"])).toEqual(["seekingGenders", "ageRange", "place"]);
    expect(missingBasics([...REQUIRED_BASICS])).toEqual([]);
  });
});

describe("basicsFrom", () => {
  it("takes only what the person stated, and marks it said", () => {
    const out = basicsFrom(ex({ basics: { displayName: " Camille ", gender: "WOMAN", seekingGenders: ["MAN", "MAN"], ageMin: 32, ageMax: 42, intent: "LONG_TERM", radiusKm: 20, place: { city: "Montréal", lat: 45.5, lng: -73.57 } } }));
    expect(out.profile).toEqual({ displayName: "Camille", gender: "WOMAN", seekingGenders: ["MAN"], ageMin: 32, ageMax: 42, intent: "LONG_TERM", radiusKm: 20 });
    expect(out.place).toEqual({ city: "Montréal", lat: 45.5, lng: -73.57 });
    expect(out.said).toEqual(["gender", "seekingGenders", "ageRange", "intent", "place"]);
  });
  it("invents nothing: an empty extraction changes nothing", () => {
    expect(basicsFrom(ex({}))).toEqual({ profile: {}, place: null, said: [] });
  });
  it("needs both ends of an age range, in order, to call it said", () => {
    expect(basicsFrom(ex({ basics: { ageMin: 30 } })).said).toEqual([]);
    expect(basicsFrom(ex({ basics: { ageMin: 40, ageMax: 30 } })).said).toEqual([]);
  });
  it("refuses the null island as a place", () => {
    expect(basicsFrom(ex({ basics: { place: { city: "Nowhere", lat: 0, lng: 0 } } })).place).toBeNull();
  });
});

describe("readiness", () => {
  const all = ["story", "seeking", "values", "humour", "basics_said"];
  const base = { userTurns: 6, said: [...REQUIRED_BASICS], facetKeys: all };
  it("is ready when turns, basics and facets are there", () => {
    expect(readiness(base, params)).toEqual({ ready: true, reason: "ok" });
  });
  it("waits for enough turns, whatever else is known", () => {
    expect(readiness({ ...base, userTurns: 4 }, params).reason).toBe("too-few-turns");
  });
  it("waits for every basic", () => {
    expect(readiness({ ...base, said: ["gender"] }, params).reason).toBe("basics-missing");
  });
  it("waits for the required facets and the minimum count (basics_said is not a facet)", () => {
    expect(readiness({ ...base, facetKeys: ["story", "values", "humour", "weekend"] }, params).reason).toBe("facets-missing"); // no seeking
    expect(readiness({ ...base, facetKeys: ["story", "seeking", "basics_said"] }, params).reason).toBe("facets-missing"); // only 2
  });
});

describe("estimateTokens", () => {
  it("is a quarter of the characters, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });
});
