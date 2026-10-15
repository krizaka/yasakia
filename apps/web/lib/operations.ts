import { accountDeletions, auditLog, db, getPool, profilePhotos, reports } from "@yasakia/db";
import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { URGENT_REASONS } from "./reports";

/** What an operator reads to know whether the instance is well: pool and connections against their budget, and what waits for a person or a job. */

/** A role's own limit (> 0) wins over the server's; -1 means the role has none. */
export const budgetLimit = (roleLimit: number, serverLimit: number) => (roleLimit > 0 ? Math.min(roleLimit, serverLimit || roleLimit) : serverLimit);

/** Share of a budget in use, 0–1, capped; 0 without a budget. */
export const budgetShare = (used: number, limit: number) => (limit > 0 ? Math.min(1, used / limit) : 0);

export interface ConnectionBudget {
  pool: { max: number; total: number; idle: number; waiting: number };
  open: number;
  limit: number;
}

export async function connectionBudget(): Promise<ConnectionBudget> {
  const pool = getPool();
  const [row] = (
    await db.execute<{ open: string; role_limit: number; server_limit: string }>(sql`
      select (select count(*) from pg_stat_activity where datname = current_database()) as open,
             (select rolconnlimit from pg_roles where rolname = current_user) as role_limit,
             current_setting('max_connections') as server_limit`)
  ).rows;
  return { pool: { max: pool.options.max ?? 10, total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }, open: Number(row.open), limit: budgetLimit(Number(row.role_limit), Number(row.server_limit)) };
}

export interface Queues {
  openReports: number;
  urgentReports: number;
  photosPending: number;
  /** Erasures whose media are not all deleted yet, and how many of those have failed at least once. */
  purgesPending: number;
  purgesFailing: number;
  /** Refused sign-ins in the last 24 hours. */
  refusedSignIns24h: number;
}

export async function queues(): Promise<Queues> {
  const [[open], [urgent], [photos], [pending], [failing], [refused]] = await Promise.all([
    db.select({ n: count() }).from(reports).where(eq(reports.status, "OPEN")),
    db.select({ n: count() }).from(reports).where(and(eq(reports.status, "OPEN"), inArray(reports.reason, [...URGENT_REASONS]))),
    db.select({ n: count() }).from(profilePhotos).where(eq(profilePhotos.moderationStatus, "PENDING")),
    db.select({ n: count() }).from(accountDeletions).where(isNull(accountDeletions.purgedAt)),
    db.select({ n: count() }).from(accountDeletions).where(and(isNull(accountDeletions.purgedAt), isNotNull(accountDeletions.purgeLastError))),
    db.select({ n: count() }).from(auditLog).where(and(eq(auditLog.action, "auth.sign_in_refused"), sql`${auditLog.createdAt} > now() - interval '24 hours'`)),
  ]);
  return { openReports: open.n, urgentReports: urgent.n, photosPending: photos.n, purgesPending: pending.n, purgesFailing: failing.n, refusedSignIns24h: refused.n };
}
