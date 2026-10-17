import crypto from "node:crypto";

import {
  accounts,
  analyticsEvents,
  batches,
  batchItems,
  db,
  intros,
  profiles,
  reports,
  userTrajectories,
} from "@yasakia/db";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";


/**
 * Loi 25 Compliant pseudonymization for telemetry.
 * Generates an irreversible keyed hash from the raw account UUID.
 */
export function pseudonymizeAccountId(accountId: string): string {
  const secret = process.env.DATABASE_ENCRYPTION_KEY || "yasakia-telemetry-secret";
  return crypto.createHmac("sha256", secret).update(accountId).digest("hex").slice(0, 32);
}

/**
 * Telemetry event recorder. Persists to local PostgreSQL telemetry table and
 * asynchronously forwards to Orazaka's Data Analysis Service when configured.
 */
export async function recordTelemetry(
  eventType: string,
  accountId: string,
  properties: Record<string, unknown> = {},
  lat?: number,
  lng?: number,
  now?: Date,
): Promise<void> {
  const pseudonym = pseudonymizeAccountId(accountId);
  let geohash: string | undefined = undefined;
  if (lat != null && lng != null) {
    // Coarse 2-decimal bucket for spatial clustering (≈ 1.1 km)
    geohash = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  }

  // 1. Local persistence (swallowing background errors)
  void db
    .insert(analyticsEvents)
    .values({
      accountIdPseudonym: pseudonym,
      eventType,
      properties,
      geohash,
      ...(now ? { createdAt: now } : {}),
    })
    .catch((err) => console.warn("[analytics] event insert failed:", (err as Error).message));

  // 2. Forward to Orazaka Data Analysis Service (RFC krizaka/orazaka#174)
  const orazakaBase = process.env.AI_ENGINE_URL?.trim();
  const key = process.env.AI_ENGINE_API_KEY?.trim();
  if (orazakaBase && key) {
    void fetch(`${orazakaBase.replace(/\/+$/, "")}/api/v1/analytics/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        tenant: "yasakia",
        pseudonym,
        eventType,
        properties,
        geohash,
        timestamp: now ? now.toISOString() : undefined,
      }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => undefined);
  }
}

export interface FunnelStep {
  name: string;
  count: number;
  conversionPercent: number;
}

export interface MatchQualityMetrics {
  totalDecisions: number;
  interestedCount: number;
  passCount: number;
  tellMeMoreCount: number;
  acceptanceRate: number;
}

export interface GeoHeatmapPoint {
  lat: number;
  lng: number;
  count: number;
  clusterLabel: string;
}

export interface AnalyticsReport {
  funnel: FunnelStep[];
  matchQuality: MatchQualityMetrics;
  heatmap: GeoHeatmapPoint[];
  anomalies: {
    urgentReports: number;
    openReports: number;
    suspendedAccounts: number;
  };
}

/**
 * Computes deep operational, matching, and geospatial analytics.
 */
export async function getAnalyticsReport(): Promise<AnalyticsReport> {
  // 1. Conversion Funnel
  const [[totalAccounts], [onboardedProfiles], [totalBatches], [totalDecisions], [totalIntros], [continuedIntros]] =
    await Promise.all([
      db.select({ n: count() }).from(accounts),
      db.select({ n: count() }).from(profiles).where(isNotNull(profiles.onboardingCompletedAt)),
      db.select({ n: count() }).from(batches),
      db.select({ n: count() }).from(batchItems).where(isNotNull(batchItems.decision)),
      db.select({ n: count() }).from(intros),
      db.select({ n: count() }).from(intros).where(eq(intros.state, "CONTINUED")),
    ]);

  const base = totalAccounts.n || 1;
  const funnel: FunnelStep[] = [
    { name: "Sign Up", count: totalAccounts.n, conversionPercent: 100 },
    {
      name: "Agent Onboarded",
      count: onboardedProfiles.n,
      conversionPercent: Math.round((onboardedProfiles.n / base) * 100),
    },
    {
      name: "Batch Unlocked",
      count: totalBatches.n,
      conversionPercent: Math.round((totalBatches.n / base) * 100),
    },
    {
      name: "Profiles Decided",
      count: totalDecisions.n,
      conversionPercent: Math.round((totalDecisions.n / (totalBatches.n * 4 || 1)) * 100),
    },
    {
      name: "Intros Opened",
      count: totalIntros.n,
      conversionPercent: Math.round((totalIntros.n / base) * 100),
    },
    {
      name: "Mutual Continuation",
      count: continuedIntros.n,
      conversionPercent: Math.round((continuedIntros.n / (totalIntros.n || 1)) * 100),
    },
  ];

  // 2. Bilateral Match Decisions
  const decisions = await db
    .select({
      decision: batchItems.decision,
      count: count(),
    })
    .from(batchItems)
    .where(isNotNull(batchItems.decision))
    .groupBy(batchItems.decision);

  let interested = 0;
  let pass = 0;
  let tellMeMore = 0;
  for (const d of decisions) {
    if (d.decision === "INTERESTED") interested = d.count;
    if (d.decision === "PASS") pass = d.count;
    if (d.decision === "TELL_ME_MORE") tellMeMore = d.count;
  }
  const totalDec = interested + pass + tellMeMore || 1;

  const matchQuality: MatchQualityMetrics = {
    totalDecisions: totalDec,
    interestedCount: interested,
    passCount: pass,
    tellMeMoreCount: tellMeMore,
    acceptanceRate: Math.round(((interested + tellMeMore) / totalDec) * 100),
  };

  // 3. Geospatial Heatmap
  const trajectoryClusters = await db
    .select({
      lat: sql<number>`round(${userTrajectories.lat}::numeric, 2)::float`,
      lng: sql<number>`round(${userTrajectories.lng}::numeric, 2)::float`,
      count: count(),
    })
    .from(userTrajectories)
    .groupBy(sql`round(${userTrajectories.lat}::numeric, 2)`, sql`round(${userTrajectories.lng}::numeric, 2)`)
    .orderBy(desc(count()))
    .limit(30);

  const heatmap: GeoHeatmapPoint[] = trajectoryClusters.map((c) => ({
    lat: c.lat,
    lng: c.lng,
    count: c.count,
    clusterLabel: `${c.lat.toFixed(2)}, ${c.lng.toFixed(2)} (${c.count} active)`,
  }));

  // 4. Safety & Anomalies
  const [[urgentReports], [openReports], [suspended]] = await Promise.all([
    db
      .select({ n: count() })
      .from(reports)
      .where(and(eq(reports.status, "OPEN"), sql`${reports.reason} in ('UNDERAGE', 'THREAT')`)),
    db.select({ n: count() }).from(reports).where(eq(reports.status, "OPEN")),
    db.select({ n: count() }).from(accounts).where(eq(accounts.status, "SUSPENDED")),
  ]);

  return {
    funnel,
    matchQuality,
    heatmap,
    anomalies: {
      urgentReports: urgentReports.n,
      openReports: openReports.n,
      suspendedAccounts: suspended.n,
    },
  };
}
