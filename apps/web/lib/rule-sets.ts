import { db, ruleSets } from "@yasakia/db";
import { MatchingParams } from "@yasakia/matching";
import { MAX_PHOTOS } from "@yasakia/media";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { audit } from "./audit";
import { AuthenticityParams } from "./authenticity-rules";
import type { AdminActor } from "./console-access";
import { HttpError, isUniqueViolation, refuse } from "./http";

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

/** The photo rules (Oussama, 2026-10-17): 4 to 6 photos, at least 2 showing the person's face. A profile holds six at most. */
export const PhotoParams = z
  .object({
    minPhotos: z.number().int().min(1).max(MAX_PHOTOS),
    maxPhotos: z.number().int().min(1).max(MAX_PHOTOS),
    minFacePhotos: z.number().int().min(0).max(MAX_PHOTOS),
  })
  .strict()
  .refine((p) => p.maxPhotos >= p.minPhotos && p.minFacePhotos <= p.maxPhotos, { message: "min ≤ max photos, face photos ≤ max photos" });
export type PhotoParams = z.infer<typeof PhotoParams>;

export const RuleDomain = { Matching: "MATCHING", Agent: "AGENT", Photos: "PHOTOS", Authenticity: "AUTHENTICITY" } as const;

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

export async function photoRules(): Promise<{ version: number; params: PhotoParams }> {
  const row = await activeRow(RuleDomain.Photos);
  const parsed = PhotoParams.safeParse(row.params);
  if (!parsed.success) throw misconfigured(`rule set PHOTOS v${row.version} is outside its bounds`);
  return { version: row.version, params: parsed.data };
}

export async function authenticityRules(): Promise<{ version: number; params: AuthenticityParams }> {
  const row = await activeRow(RuleDomain.Authenticity);
  const parsed = AuthenticityParams.safeParse(row.params);
  if (!parsed.success) throw misconfigured(`rule set AUTHENTICITY v${row.version} is outside its bounds`);
  return { version: row.version, params: parsed.data };
}

/* ── The administration of the rule sets: read the history, publish a new version with a reason, restore an old one. ── */

export type RuleDomain = (typeof RuleDomain)[keyof typeof RuleDomain];
export const RULE_DOMAINS = Object.values(RuleDomain);

const SCHEMAS: Record<RuleDomain, z.ZodObject> = { [RuleDomain.Matching]: MatchingParams, [RuleDomain.Agent]: AgentParams, [RuleDomain.Photos]: PhotoParams, [RuleDomain.Authenticity]: AuthenticityParams };

/** A domain from a URL segment: only the ones the app reads (anything else does not exist — 404). */
export function parseRuleDomain(value: string): RuleDomain {
  const domain = RULE_DOMAINS.find((d) => d === value);
  if (!domain) throw refuse(404, "NOT_FOUND", "Not found");
  return domain;
}

/** The parameters of a new version, checked against the bounds the code holds (the same schema the app reads with). */
export function checkRuleParams(domain: RuleDomain, params: unknown): Record<string, unknown> {
  const parsed = SCHEMAS[domain].safeParse(params);
  if (!parsed.success) throw refuse(422, "RULES_OUT_OF_BOUNDS", "These parameters are outside their bounds", { fields: parsed.error.issues.map((i) => i.path.join(".") || i.message) });
  return parsed.data;
}

export interface RuleField {
  key: string;
  min: number;
  max: number;
  step: number;
}

/** The numbers of a domain with the bounds its schema holds — the console offers each as a slider (lists stay as they are). */
export function ruleFields(domain: RuleDomain): RuleField[] {
  return Object.entries(SCHEMAS[domain].shape).flatMap(([key, field]) => {
    if (!(field instanceof z.ZodNumber) || field.minValue === null || field.maxValue === null) return [];
    const { minValue: min, maxValue: max } = field;
    return [{ key, min, max, step: field.isInt ? (max - min > 1000 ? 10 : 1) : 0.01 }];
  });
}

/** The keys whose value differs between two versions (the preview, and the audit line). */
export function changedParams(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort();
}

export interface RuleSetVersion {
  version: number;
  active: boolean;
  params: Record<string, unknown>;
  reason: string;
  createdAt: string;
}

/** Every version of every domain the app reads, newest first. */
export async function ruleSetHistory(): Promise<Record<RuleDomain, RuleSetVersion[]>> {
  const rows = await db
    .select({ domain: ruleSets.domain, version: ruleSets.version, active: ruleSets.active, params: ruleSets.params, reason: ruleSets.reason, createdAt: ruleSets.createdAt })
    .from(ruleSets)
    .where(inArray(ruleSets.domain, RULE_DOMAINS))
    .orderBy(desc(ruleSets.version));
  const out = Object.fromEntries(RULE_DOMAINS.map((d) => [d, [] as RuleSetVersion[]])) as Record<RuleDomain, RuleSetVersion[]>;
  for (const r of rows) out[r.domain as RuleDomain].push({ version: r.version, active: r.active, params: r.params, reason: r.reason, createdAt: r.createdAt.toISOString() });
  return out;
}

/**
 * Publishes a new version and makes it the active one, in one transaction: the history is append-only (restoring an old
 * version publishes its parameters again, as a new version), a batch already opened keeps the version it was made under.
 */
export async function publishRuleSet(domain: RuleDomain, params: unknown, reason: string, actor: AdminActor, headers: Headers, restoredFrom?: number): Promise<{ version: number; changed: string[] }> {
  const next = checkRuleParams(domain, params);
  try {
    const result = await db.transaction(async (tx) => {
      const current = await tx.select({ version: ruleSets.version, active: ruleSets.active, params: ruleSets.params }).from(ruleSets).where(eq(ruleSets.domain, domain)).orderBy(desc(ruleSets.version)).for("update");
      const active = current.find((r) => r.active);
      const changed = changedParams(active?.params ?? {}, next);
      if (active && changed.length === 0) throw refuse(409, "RULES_UNCHANGED", "This version is the active one already");
      const version = (current[0]?.version ?? 0) + 1;
      await tx.update(ruleSets).set({ active: false }).where(and(eq(ruleSets.domain, domain), eq(ruleSets.active, true)));
      await tx.insert(ruleSets).values({ domain, version, active: true, params: next, reason });
      return { version, changed };
    });
    await audit({ action: "admin.rules_published", actorId: actor.id, actorLabel: actor.label, detail: { domain, version: result.version, changed: result.changed.join(","), restoredFrom: restoredFrom ?? null, reason }, headers });
    return result;
  } catch (error) {
    if (isUniqueViolation(error)) throw refuse(409, "CONFLICT", "Another version was published at the same time");
    throw error;
  }
}

/** Publishes again the parameters of an earlier version (a rollback is a new version, with its reason). */
export async function restoreRuleSet(domain: RuleDomain, from: number, reason: string, actor: AdminActor, headers: Headers): Promise<{ version: number; changed: string[] }> {
  const [row] = await db.select({ params: ruleSets.params }).from(ruleSets).where(and(eq(ruleSets.domain, domain), eq(ruleSets.version, from))).limit(1);
  if (!row) throw refuse(404, "NOT_FOUND", "Not found");
  return publishRuleSet(domain, row.params, reason, actor, headers, from);
}
