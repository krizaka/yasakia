import { db, ruleSets } from "@yasakia/db";
import { MatchingParams } from "@yasakia/matching";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { HttpError } from "./http";

/**
 * The active rule sets — versioned rows, never constants (org rule). Read on use and checked against their bounds: a
 * row outside them is a configuration error (503), not a silent default.
 */

export const AgentParams = z
  .object({
    minUserTurns: z.number().int().min(1).max(30),
    historyMessages: z.number().int().min(4).max(200),
    messageMaxChars: z.number().int().min(100).max(5000),
    requiredFacets: z.array(z.string()).max(8),
    minFacets: z.number().int().min(1).max(8),
  })
  .strict();
export type AgentParams = z.infer<typeof AgentParams>;

export const RuleDomain = { Matching: "MATCHING", Agent: "AGENT" } as const;

/** A rule set the database cannot give is a configuration problem: 503, the name logged, nothing leaked. */
function misconfigured(what: string): HttpError {
  console.error(`[rule-sets] ${what}`);
  return new HttpError(503, "Service temporarily unavailable", { code: "UNAVAILABLE" });
}

async function activeRow(domain: string): Promise<{ version: number; params: Record<string, unknown> }> {
  const [row] = await db
    .select({ version: ruleSets.version, params: ruleSets.params })
    .from(ruleSets)
    .where(and(eq(ruleSets.domain, domain), eq(ruleSets.active, true)))
    .limit(1);
  if (!row) throw misconfigured(`rule set ${domain} has no active version`);
  return row;
}

export async function matchingRules(): Promise<{ version: number; params: MatchingParams }> {
  const row = await activeRow(RuleDomain.Matching);
  const parsed = MatchingParams.safeParse(row.params);
  if (!parsed.success) throw misconfigured(`rule set MATCHING v${row.version} is outside its bounds`);
  return { version: row.version, params: parsed.data };
}

export async function agentRules(): Promise<{ version: number; params: AgentParams }> {
  const row = await activeRow(RuleDomain.Agent);
  const parsed = AgentParams.safeParse(row.params);
  if (!parsed.success) throw misconfigured(`rule set AGENT v${row.version} is outside its bounds`);
  return { version: row.version, params: parsed.data };
}
