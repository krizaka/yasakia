/**
 * Positions are rounded **before** they are written: the exact one a phone sends never reaches the database. The grid
 * is about 1 km (`GEO_PRECISION_M`): latitude in steps of 1 km of arc, longitude in steps that are 1 km wide at that
 * latitude. Everyone in the same cell stores the same point; the stored point is at most ~710 m (half the cell's
 * diagonal) from the true one — enough to filter by radius, never enough to find a door.
 */

export const GEO_PRECISION_M = 1000;

const EARTH_RADIUS_M = 6_371_008.8;
const METERS_PER_DEGREE = (Math.PI / 180) * EARTH_RADIUS_M; // ≈ 111 195 m

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export interface RoundedPosition {
  lat: number;
  lng: number;
  precisionM: number;
}

/** The position stored for a phone's coordinates. */
export function roundPosition(lat: number, lng: number, precisionM = GEO_PRECISION_M): RoundedPosition {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new RangeError("invalid coordinates");
  const latStep = precisionM / METERS_PER_DEGREE;
  const snappedLat = Math.max(-90, Math.min(90, Math.round(lat / latStep) * latStep));
  // Near the poles a kilometre spans many degrees of longitude: cap the step at a whole turn.
  const cos = Math.max(Math.cos((snappedLat * Math.PI) / 180), precisionM / (METERS_PER_DEGREE * 360));
  const lngStep = precisionM / (METERS_PER_DEGREE * cos);
  let snappedLng = Math.round(lng / lngStep) * lngStep;
  if (snappedLng > 180) snappedLng -= 360;
  if (snappedLng < -180) snappedLng += 360;
  return { lat: round6(snappedLat), lng: round6(snappedLng), precisionM };
}

/** Great-circle distance in metres (haversine) — tests and checks; queries use PostgreSQL's earthdistance. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
