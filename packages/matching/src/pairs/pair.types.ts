/** What the matching knows of a person: the non-negotiables (profile) and the two vectors of their portrait. */

export const Gender = { Woman: "WOMAN", Man: "MAN", NonBinary: "NON_BINARY" } as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

export const Intent = {
  LongTerm: "LONG_TERM",
  OpenToLongTerm: "OPEN_TO_LONG_TERM",
  Casual: "CASUAL",
  FriendshipFirst: "FRIENDSHIP_FIRST",
  NotSure: "NOT_SURE",
} as const;
export type Intent = (typeof Intent)[keyof typeof Intent];

export interface Person {
  id: string;
  gender: Gender;
  seekingGenders: readonly Gender[];
  /** Whole years, computed by the caller from the date of birth (which never enters the matching). */
  age: number;
  ageMin: number;
  ageMax: number;
  intent: Intent;
  radiusKm: number;
  /** Rounded position (about 1 km): the matching never sees an exact one. */
  lat: number;
  lng: number;
  /** Who this person is, embedded. */
  self: readonly number[];
  /** Who this person looks for, embedded. */
  seeking: readonly number[];
}

/** A pair that passed the filters both ways. `affinity` is internal: it orders the batch and is never sent to a client. */
export interface RankedPair {
  candidateId: string;
  affinity: number;
  /** The two directions, for the reasons and the calibration (internal too). */
  towardsThem: number;
  towardsYou: number;
}
