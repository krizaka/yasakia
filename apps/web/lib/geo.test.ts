import { describe, expect, it } from "vitest";

import { distanceMeters, GEO_PRECISION_M, roundPosition } from "./geo";

describe("position rounding (~1 km, before anything is written)", () => {
  it("moves the point, by at most half a cell's diagonal", () => {
    const exact = { lat: 45.508844, lng: -73.587811 };
    const kept = roundPosition(exact.lat, exact.lng);
    expect(kept.precisionM).toBe(GEO_PRECISION_M);
    expect(kept).not.toMatchObject(exact);
    expect(distanceMeters(exact, kept)).toBeLessThanOrEqual(710);
  });

  it("gives everyone in the same cell the same point", () => {
    const a = roundPosition(45.5088, -73.5878);
    const b = roundPosition(45.5091, -73.5873);
    expect(a).toEqual(b);
  });

  it("holds on a grid of places, from the equator to the far north", () => {
    for (let lat = -80; lat <= 80; lat += 7.3) {
      for (let lng = -179; lng <= 179; lng += 23.7) {
        const kept = roundPosition(lat, lng);
        expect(distanceMeters({ lat, lng }, kept)).toBeLessThanOrEqual(710);
        expect(Math.abs(kept.lng)).toBeLessThanOrEqual(180);
      }
    }
  });

  it("is idempotent: rounding a stored point keeps it", () => {
    const kept = roundPosition(48.8566, 2.3522);
    expect(roundPosition(kept.lat, kept.lng)).toEqual(kept);
  });

  it("refuses impossible coordinates", () => {
    expect(() => roundPosition(91, 0)).toThrow(RangeError);
    expect(() => roundPosition(0, 181)).toThrow(RangeError);
    expect(() => roundPosition(Number.NaN, 0)).toThrow(RangeError);
  });
});
