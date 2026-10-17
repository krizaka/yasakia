import { z } from "zod";

import { rankPair } from "./affinity";
import { passesFilters } from "./filters";
import type { Person, RankedPair } from "./pair.types";

/** The parameters of a batch — a row of `rule_sets` (domain MATCHING), never a constant (org rule). */
export const MatchingParams = z
  .object({
    batchMin: z.number().int().min(1).max(10),
    batchMax: z.number().int().min(1).max(10),
    batchHours: z.number().int().min(1).max(24 * 14),
    candidatePool: z.number().int().min(10).max(2000),
    minAffinity: z.number().min(0).max(1),
    introDays: z.number().int().min(1).max(30),
  })
  .strict()
  .refine((p) => p.batchMin <= p.batchMax, { message: "batchMin must not exceed batchMax" });
export type MatchingParams = z.infer<typeof MatchingParams>;

/**
 * The batch for one person: candidates that pass the hard filters both ways, ranked by the weaker direction, the ones
 * under `minAffinity` dropped, the best `batchMax` kept. Fewer than `batchMin` left means **no batch** (null) — the
 * product never fills a batch with people who do not fit.
 */
export function selectBatch(me: Person, candidates: readonly Person[], params: MatchingParams): RankedPair[] | null {
  const ranked = candidates
    .filter((c) => passesFilters(me, c))
    .map((c) => rankPair(me, c))
    .filter((p) => p.affinity >= params.minAffinity)
    .sort((x, y) => y.affinity - x.affinity || x.candidateId.localeCompare(y.candidateId));
  const picked = ranked.slice(0, params.batchMax);
  return picked.length >= params.batchMin ? picked : null;
}
