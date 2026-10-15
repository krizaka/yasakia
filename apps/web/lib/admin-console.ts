import { accounts, batches, checkDbHealth, db, introMessages, intros, reports } from "@yasakia/db";
import { open } from "@yasakia/db";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import { audit } from "./audit";
import { type AdminActor } from "./console-access";
import { refuse } from "./http";
import { realtimeConnected } from "./realtime";
import { detailsContext, URGENT_REASONS } from "./reports";

/**
 * What the administration console reads beyond people: the overview, the moderation queue (reports), the introductions
 * overview and the health of the instance. Operators see ids, reasons, states and counts — a report's free text only when
 * they open that report; never a message, a photo or a score.
 */

export const REPORT_STATUSES = ["OPEN", "REVIEWED", "ACTIONED", "DISMISSED"] as const;
export const INTRO_STATES = ["OPEN", "CONTINUED", "FADED", "CLOSED"] as const;

export async function overview() {
  const [byStatus, [openReports], [urgentOpen], byIntro, [openBatches]] = await Promise.all([
    db.select({ status: accounts.status, n: count() }).from(accounts).groupBy(accounts.status),
    db.select({ n: count() }).from(reports).where(eq(reports.status, "OPEN")),
    db.select({ n: count() }).from(reports).where(and(eq(reports.status, "OPEN"), inArray(reports.reason, [...URGENT_REASONS]))),
    db.select({ state: intros.state, n: count() }).from(intros).groupBy(intros.state),
    db.select({ n: count() }).from(batches).where(inArray(batches.status, ["OPEN", "DEBRIEF_DUE"])),
  ]);
  const get = (rows: { n: number; status?: string; state?: string }[], key: string) => rows.find((r) => r.status === key || r.state === key)?.n ?? 0;
  return {
    accounts: { active: get(byStatus, "ACTIVE"), paused: get(byStatus, "PAUSED"), suspended: get(byStatus, "SUSPENDED") },
    reports: { open: openReports.n, urgentOpen: urgentOpen.n },
    intros: Object.fromEntries(INTRO_STATES.map((s) => [s, get(byIntro, s)])) as Record<(typeof INTRO_STATES)[number], number>,
    openBatches: openBatches.n,
  };
}

export interface ReportQuery {
  status?: string[];
  reason?: string[];
  dir: "asc" | "desc";
  page: number;
  size: number;
}

export async function listReportQueue(q: ReportQuery) {
  const statuses = q.status?.filter((s): s is (typeof REPORT_STATUSES)[number] => (REPORT_STATUSES as readonly string[]).includes(s));
  const where = statuses?.length ? inArray(reports.status, statuses) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(reports).where(where);
  const rows = await db
    .select({ id: reports.id, reporterId: reports.reporterId, reportedId: reports.reportedId, reason: reports.reason, status: reports.status, introId: reports.introId, photoId: reports.photoId, createdAt: reports.createdAt, reviewedAt: reports.reviewedAt })
    .from(reports)
    .where(where)
    .orderBy(sql`case when ${reports.reason} in ('UNDERAGE', 'THREAT') and ${reports.status} = 'OPEN' then 0 else 1 end`, q.dir === "asc" ? asc(reports.createdAt) : desc(reports.createdAt))
    .limit(q.size)
    .offset((q.page - 1) * q.size);
  return { total, rows: rows.map((r) => ({ ...r, urgent: URGENT_REASONS.includes(r.reason) })) };
}

/** One report with its details opened (operators only). */
export async function reportDetails(id: string) {
  const [r] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!r) throw refuse(404, "NOT_FOUND", "Not found");
  return { id: r.id, details: r.detailsSealed ? open(r.detailsSealed, detailsContext(r.id)) : null };
}

export async function setReportStatus(id: string, status: (typeof REPORT_STATUSES)[number], actor: AdminActor, headers: Headers): Promise<void> {
  const rows = await db.update(reports).set({ status, reviewedAt: status === "OPEN" ? null : new Date() }).where(eq(reports.id, id)).returning({ reportedId: reports.reportedId });
  if (rows.length === 0) throw refuse(404, "NOT_FOUND", "Not found");
  await audit({ action: "admin.report", actorId: actor.id, actorLabel: actor.label, targetId: rows[0].reportedId, detail: { report: id.slice(0, 8), status }, headers });
}

export interface IntroQuery {
  state?: string[];
  dir: "asc" | "desc";
  page: number;
  size: number;
}

/** The introductions as an operator sees them: ids, state, dates, how many messages — never who said what. */
export async function listIntroOverview(q: IntroQuery) {
  const states = q.state?.filter((s): s is (typeof INTRO_STATES)[number] => (INTRO_STATES as readonly string[]).includes(s));
  const where = states?.length ? inArray(intros.state, states) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(intros).where(where);
  const rows = await db
    .select({
      id: intros.id,
      state: intros.state,
      openedAt: intros.openedAt,
      expiresAt: intros.expiresAt,
      closedReason: intros.closedReason,
      frozen: sql<boolean>`${intros.frozenAt} is not null`,
      messages: sql<number>`(select count(*) from ${introMessages} where ${introMessages.introId} = ${intros.id})::int`,
    })
    .from(intros)
    .where(where)
    .orderBy(q.dir === "asc" ? asc(intros.openedAt) : desc(intros.openedAt))
    .limit(q.size)
    .offset((q.page - 1) * q.size);
  return { total, rows };
}

const STARTED = Date.now();

export async function healthReport() {
  const database = await checkDbHealth();
  return {
    status: database ? "ok" : "degraded",
    database,
    realtime: realtimeConnected() ? "connected" : "idle",
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? "local",
    uptimeSeconds: Math.round((Date.now() - STARTED) / 1000),
    node: process.version,
    signupOpen: process.env.AUTH_SIGNUP_ENABLED?.trim().toLowerCase() === "true",
  };
}
