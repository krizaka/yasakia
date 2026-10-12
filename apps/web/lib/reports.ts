import { accounts, db, intros, open, profilePhotos, reports, seal } from "@yazakia/db";
import { and, desc, eq, sql } from "drizzle-orm";

import { refuse } from "./http";

/**
 * Reports: persisted **before** they are acknowledged, with a normalised reason; the free text is sealed (AES-256-GCM)
 * and only operators read it (`GET /api/admin/reports`). A report made inside an intro freezes it (nobody writes while
 * it is reviewed). Reporting never tells the reported person.
 */

export const REPORT_REASONS = ["UNDERAGE", "THREAT", "HARASSMENT", "HATE", "SCAM", "FAKE_PROFILE", "INAPPROPRIATE_PHOTO", "OFFLINE_BEHAVIOUR", "OTHER"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** Reviewed first. */
export const URGENT_REASONS: readonly ReportReason[] = ["UNDERAGE", "THREAT"];

export const detailsContext = (reportId: string) => `reports:${reportId}:details`;

export async function fileReport(reporterId: string, input: { accountId: string; reason: ReportReason; details?: string; photoId?: string; introId?: string }) {
  if (input.accountId === reporterId) throw refuse(400, "SELF", "You cannot report yourself");
  const [target] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, input.accountId)).limit(1);
  if (!target) throw refuse(404, "NOT_FOUND", "Not found");
  if (input.photoId) {
    const [photo] = await db
      .select({ id: profilePhotos.id })
      .from(profilePhotos)
      .where(and(eq(profilePhotos.id, input.photoId), eq(profilePhotos.accountId, input.accountId)))
      .limit(1);
    if (!photo) throw refuse(404, "NOT_FOUND", "Not found");
  }
  const [a, b] = reporterId < input.accountId ? [reporterId, input.accountId] : [input.accountId, reporterId];
  if (input.introId) {
    const [intro] = await db
      .select({ id: intros.id })
      .from(intros)
      .where(and(eq(intros.id, input.introId), eq(intros.accountA, a), eq(intros.accountB, b)))
      .limit(1);
    if (!intro) throw refuse(404, "NOT_FOUND", "Not found");
  }
  return db.transaction(async (tx) => {
    const id = crypto.randomUUID();
    const details = input.details?.trim();
    const [report] = await tx
      .insert(reports)
      .values({ id, reporterId, reportedId: input.accountId, reason: input.reason, detailsSealed: details ? seal(details, detailsContext(id)) : null, photoId: input.photoId ?? null, introId: input.introId ?? null })
      .returning({ id: reports.id, createdAt: reports.createdAt });
    if (input.introId) await tx.update(intros).set({ frozenAt: new Date() }).where(eq(intros.id, input.introId));
    return report;
  });
}

/** The reports for operators, urgent reasons first, details opened. */
export async function listReports(status: "OPEN" | "REVIEWED" | "ACTIONED" | "DISMISSED" | "ALL", limit = 100) {
  const rows = await db
    .select()
    .from(reports)
    .where(status === "ALL" ? undefined : eq(reports.status, status))
    .orderBy(sql`case when ${reports.reason} in ('UNDERAGE', 'THREAT') then 0 else 1 end`, desc(reports.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    reporterId: r.reporterId,
    reportedId: r.reportedId,
    reason: r.reason,
    urgent: URGENT_REASONS.includes(r.reason),
    details: r.detailsSealed ? open(r.detailsSealed, detailsContext(r.id)) : null,
    photoId: r.photoId,
    introId: r.introId,
    status: r.status,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
  }));
}
