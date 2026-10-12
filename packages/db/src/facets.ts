import { eq, sql } from "drizzle-orm";

import type { Database } from "./client";
import { openJson, sealJson } from "./crypto";
import { facets } from "./schema";

/**
 * The one door to the `facets` table: a sensitive facet is sealed before it is written and opened when it is read —
 * no other code touches `value_sealed`. The agent (PY3) writes through `writeFacet`; the export reads through
 * `readFacets`.
 */

export const facetContext = (accountId: string, key: string) => `facets:${accountId}:${key}`;

export interface FacetInput {
  key: string;
  value: unknown;
  sensitive: boolean;
  /** 0..1; 1 when the person set it. */
  confidence: number;
  sourceMessageId?: string | null;
}

export interface FacetValue {
  key: string;
  value: unknown;
  sensitive: boolean;
  confidence: number;
  updatedAt: Date;
}

/** The row to store for a facet: the value in clear, or sealed when the facet is sensitive. */
export function facetRow(accountId: string, input: FacetInput) {
  const confidence = Math.min(1, Math.max(0, input.confidence));
  return input.sensitive
    ? { accountId, key: input.key, value: null, valueSealed: sealJson(input.value, facetContext(accountId, input.key)), sensitive: true, confidence }
    : { accountId, key: input.key, value: input.value ?? null, valueSealed: null, sensitive: false, confidence };
}

/** Creates or replaces one facet of an account. */
export async function writeFacet(db: Database, accountId: string, input: FacetInput): Promise<void> {
  const row = { ...facetRow(accountId, input), sourceMessageId: input.sourceMessageId ?? null };
  await db
    .insert(facets)
    .values(row)
    .onConflictDoUpdate({
      target: [facets.accountId, facets.key],
      set: { value: row.value, valueSealed: row.valueSealed, sensitive: row.sensitive, confidence: row.confidence, sourceMessageId: row.sourceMessageId, updatedAt: sql`now()` },
    });
}

/** Every facet of an account, sensitive ones opened. */
export async function readFacets(db: Database, accountId: string): Promise<FacetValue[]> {
  const rows = await db.select().from(facets).where(eq(facets.accountId, accountId)).orderBy(facets.key);
  return rows.map((row) => ({
    key: row.key,
    value: row.valueSealed ? openJson(row.valueSealed, facetContext(accountId, row.key)) : row.value,
    sensitive: row.sensitive,
    confidence: row.confidence,
    updatedAt: row.updatedAt,
  }));
}
