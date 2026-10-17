import { describe, expect, it } from "vitest";

import { cosine, rankPair } from "./affinity";
import { MatchingParams, selectBatch } from "./batch";
import { distanceKm, intentsFit, passesFilters } from "./filters";
import { Gender, Intent, type Person } from "./pair.types";

const MONTREAL = { lat: 45.5, lng: -73.57 };
const QUEBEC = { lat: 46.81, lng: -71.21 };

/** A unit vector along an axis: two people on the same axis are alike, on different axes they are not. */
const axis = (i: number, n = 4): number[] => Array.from({ length: n }, (_, k) => (k === i ? 1 : 0));

function person(id: string, over: Partial<Person> = {}): Person {
  return {
    id,
    gender: Gender.Woman,
    seekingGenders: [Gender.Man, Gender.Woman],
    age: 32,
    ageMin: 25,
    ageMax: 40,
    intent: Intent.LongTerm,
    radiusKm: 50,
    ...MONTREAL,
    self: axis(0),
    seeking: axis(0),
    ...over,
  };
}

const params: MatchingParams = MatchingParams.parse({ batchMin: 2, batchMax: 3, batchHours: 72, candidatePool: 200, minAffinity: 0.5 });

describe("cosine", () => {
  it("is 1 for the same direction, 0 for orthogonal, and 0 for a zero vector", () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosine(axis(0), axis(1))).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
  it("refuses vectors of different lengths", () => {
    expect(() => cosine([1], [1, 2])).toThrow(/different lengths/);
  });
});

describe("distanceKm", () => {
  it("measures Montréal to Québec at about 233 km", () => {
    expect(distanceKm(MONTREAL, QUEBEC)).toBeGreaterThan(225);
    expect(distanceKm(MONTREAL, QUEBEC)).toBeLessThan(245);
  });
});

describe("hard filters, both ways", () => {
  const me = person("me", { gender: Gender.Woman, seekingGenders: [Gender.Man] });
  it("lets through a man who looks for women inside both age ranges and both radii", () => {
    expect(passesFilters(me, person("him", { gender: Gender.Man, seekingGenders: [Gender.Woman], age: 34 }))).toBe(true);
  });
  it("refuses someone I do not look for", () => {
    expect(passesFilters(me, person("her", { gender: Gender.Woman, seekingGenders: [Gender.Woman] }))).toBe(false);
  });
  it("refuses someone who does not look for me, even if I look for them", () => {
    expect(passesFilters(me, person("him", { gender: Gender.Man, seekingGenders: [Gender.Man] }))).toBe(false);
  });
  it("refuses an age outside my range, and my age outside theirs", () => {
    expect(passesFilters(me, person("old", { gender: Gender.Man, seekingGenders: [Gender.Woman], age: 55 }))).toBe(false);
    expect(passesFilters(me, person("picky", { gender: Gender.Man, seekingGenders: [Gender.Woman], age: 30, ageMin: 18, ageMax: 28 }))).toBe(false);
  });
  it("refuses someone outside either radius", () => {
    const far = person("far", { gender: Gender.Man, seekingGenders: [Gender.Woman], ...QUEBEC, radiusKm: 500 });
    expect(passesFilters(me, far)).toBe(false); // my radius is 50 km
    expect(passesFilters(person("me2", { seekingGenders: [Gender.Man], radiusKm: 500 }), person("near", { gender: Gender.Man, seekingGenders: [Gender.Woman], ...QUEBEC, radiusKm: 50 }))).toBe(false); // theirs is 50 km
  });
  it("refuses incompatible intents in either direction, never the person themself", () => {
    expect(intentsFit(Intent.LongTerm, Intent.Casual)).toBe(false);
    expect(intentsFit(Intent.Casual, Intent.LongTerm)).toBe(false);
    expect(intentsFit(Intent.NotSure, Intent.Casual)).toBe(true);
    expect(passesFilters(me, person("me"))).toBe(false);
  });
});

describe("pair affinity", () => {
  it("is the weaker of the two directions", () => {
    const me = person("me", { seeking: axis(1), self: axis(0) });
    const candidate = person("c", { seeking: axis(2), self: axis(1) });
    // I look for axis 1 and they are axis 1 (1.0); they look for axis 2 and I am axis 0 (0.0).
    const pair = rankPair(me, candidate);
    expect(pair.towardsThem).toBeCloseTo(1);
    expect(pair.towardsYou).toBe(0);
    expect(pair.affinity).toBe(0);
  });
  it("is high only when both fit", () => {
    const me = person("me", { seeking: axis(1), self: axis(0) });
    const mutual = person("c", { seeking: axis(0), self: axis(1) });
    expect(rankPair(me, mutual).affinity).toBeCloseTo(1);
  });
});

describe("selectBatch", () => {
  const me = person("me", { seekingGenders: [Gender.Woman, Gender.Man], self: axis(0), seeking: axis(1) });
  const fits = (id: string, tilt = 0) => person(id, { self: [0, 1, tilt, 0], seeking: [1, 0, 0, tilt], gender: Gender.Man, seekingGenders: [Gender.Woman, Gender.Man] });

  it("keeps the best batchMax, best first", () => {
    const batch = selectBatch(me, [fits("a", 0.9), fits("b", 0.1), fits("c", 0.3), fits("d", 0.0)], params);
    expect(batch?.map((p) => p.candidateId)).toEqual(["d", "b", "c"]);
  });
  it("is null when fewer than batchMin people fit both ways — it never fills a batch", () => {
    expect(selectBatch(me, [fits("a", 0), person("stranger", { self: axis(3), seeking: axis(3) })], params)).toBeNull();
  });
  it("drops people under minAffinity", () => {
    const batch = selectBatch(me, [fits("a", 0), fits("b", 0), fits("weak", 3)], { ...params, minAffinity: 0.9 });
    expect(batch?.map((p) => p.candidateId)).toEqual(["a", "b"]);
  });
  it("is stable: equal affinity is ordered by id", () => {
    expect(selectBatch(me, [fits("z"), fits("m"), fits("a")], params)?.map((p) => p.candidateId)).toEqual(["a", "m", "z"]);
  });
  it("never includes someone the hard filters refuse, however alike they are", () => {
    const wrongCity = { ...fits("quebec"), ...QUEBEC };
    expect(selectBatch(me, [wrongCity, fits("a"), fits("b")], params)?.map((p) => p.candidateId)).toEqual(["a", "b"]);
  });
});

describe("MatchingParams", () => {
  it("is bounded and refuses unknown keys and batchMin above batchMax", () => {
    expect(() => MatchingParams.parse({ batchMin: 5, batchMax: 3, batchHours: 72, candidatePool: 200, minAffinity: 0.5 })).toThrow();
    expect(() => MatchingParams.parse({ batchMin: 3, batchMax: 5, batchHours: 72, candidatePool: 200, minAffinity: 1.5 })).toThrow();
    expect(() => MatchingParams.parse({ batchMin: 3, batchMax: 5, batchHours: 72, candidatePool: 200, minAffinity: 0.5, extra: 1 })).toThrow();
  });
});
