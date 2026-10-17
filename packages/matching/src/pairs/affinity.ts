import type { Person, RankedPair } from "./pair.types";

/** Cosine similarity of two vectors of the same length (0 when either is the zero vector). */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error(`cosine: vectors of different lengths (${a.length}, ${b.length})`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** How much `b` is what `a` looks for: a's SEEKING against b's SELF. */
export const towards = (a: Person, b: Person): number => cosine(a.seeking, b.self);

/**
 * The pair's affinity: the **weaker** of the two directions. A person who fits you while you do not fit them is not a
 * match — "both ways" is the product (ADR-001). The result is internal: it orders, it is never shown.
 */
export function rankPair(me: Person, candidate: Person): RankedPair {
  const towardsThem = towards(me, candidate);
  const towardsYou = towards(candidate, me);
  return { candidateId: candidate.id, affinity: Math.min(towardsThem, towardsYou), towardsThem, towardsYou };
}
