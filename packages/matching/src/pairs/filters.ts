import { Intent, type Person } from "./pair.types";

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km (haversine) between two rounded positions. */
export function distanceKm(a: Pick<Person, "lat" | "lng">, b: Pick<Person, "lat" | "lng">): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * What "looking for" means as a non-negotiable (the intent is checked in both directions). The same intent always fits and
 * `NOT_SURE` fits every other; a long-term wish does not fit a casual one; friendship first sits between.
 */
const COMPATIBLE: Record<Intent, readonly Intent[]> = {
  [Intent.LongTerm]: [Intent.LongTerm, Intent.OpenToLongTerm, Intent.NotSure],
  [Intent.OpenToLongTerm]: [Intent.LongTerm, Intent.OpenToLongTerm, Intent.FriendshipFirst, Intent.NotSure],
  [Intent.Casual]: [Intent.Casual, Intent.NotSure],
  [Intent.FriendshipFirst]: [Intent.OpenToLongTerm, Intent.FriendshipFirst, Intent.NotSure],
  [Intent.NotSure]: [Intent.LongTerm, Intent.OpenToLongTerm, Intent.Casual, Intent.FriendshipFirst, Intent.NotSure],
};

export const intentsFit = (a: Intent, b: Intent): boolean => COMPATIBLE[a].includes(b);

/** One direction of the hard filters: does `b` satisfy what `a` requires? */
export function satisfies(a: Person, b: Person): boolean {
  return a.seekingGenders.includes(b.gender) && b.age >= a.ageMin && b.age <= a.ageMax && intentsFit(a.intent, b.intent) && distanceKm(a, b) <= a.radiusKm;
}

/** The hard filters, both ways: each must satisfy the other (a candidate must also be inside both radii, both ages, both wishes). */
export const passesFilters = (a: Person, b: Person): boolean => a.id !== b.id && satisfies(a, b) && satisfies(b, a);
