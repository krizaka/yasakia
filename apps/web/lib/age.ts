/**
 * 18+ — checked by the server when an account is created, never trusted from a box the client ticked. The date of
 * birth is private (never shown; only an age range filters the matching).
 */

export const MINIMUM_AGE = 18;

/** Whole years between a YYYY-MM-DD birth date and `today` (UTC). */
export function ageOn(birthDate: string, today: Date = new Date()): number {
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = today.getUTCFullYear() - y;
  const month = today.getUTCMonth() + 1;
  if (month < m || (month === m && today.getUTCDate() < d)) age -= 1;
  return age;
}

export type BirthDateCheck = { ok: true; age: number } | { ok: false; code: "BIRTH_DATE_INVALID" | "UNDERAGE" };

/** A real calendar date, not in the future, at most 120 years ago, and 18 or older today. */
export function checkBirthDate(birthDate: string, today: Date = new Date()): BirthDateCheck {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return { ok: false, code: "BIRTH_DATE_INVALID" };
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return { ok: false, code: "BIRTH_DATE_INVALID" };
  if (date.getTime() > today.getTime()) return { ok: false, code: "BIRTH_DATE_INVALID" };
  const age = ageOn(birthDate, today);
  if (age > 120) return { ok: false, code: "BIRTH_DATE_INVALID" };
  if (age < MINIMUM_AGE) return { ok: false, code: "UNDERAGE" };
  return { ok: true, age };
}
