import { createHmac } from "node:crypto";

import { analyticsOutbox, db } from "@yasakia/db";
import { addDays, addSeconds } from "date-fns";
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";

/**
 * Product analytics on Orazaka (krizaka/yasakia#86, ADR-081 of orazaka-packs). Yasakia records what happens in the
 * loop — a turn with the agent, a batch opened, a candidate answered, an introduction started, a report filed — in an
 * outbox; a background loop sends it to `POST /api/v1/analytics/events` with Yasakia's service key. Only pseudonyms
 * leave: `HMAC-SHA256(AI_PSEUDONYM_KEY, account id)`, computed when sending, never stored at Orazaka in clear. No message,
 * no place, no profile, no score. The console reads the result back (`/admin/analytics`), counts only, with Orazaka's
 * audience threshold (nothing about fewer than 3 people).
 */

/** The kinds Yasakia sends — rows of Orazaka's `analytics_event_kind`. */
export const AnalyticsKind = {
  Talk: "talk",
  BatchOpen: "batch_open",
  BatchAnswer: "batch_answer",
  IntroStart: "intro_start",
  ReportFiled: "report_filed",
} as const;
export type AnalyticsKind = (typeof AnalyticsKind)[keyof typeof AnalyticsKind];

export const OutboxKind = { Event: "EVENT", Erasure: "ERASURE" } as const;
export type OutboxKind = (typeof OutboxKind)[keyof typeof OutboxKind];

/** What an outbox row holds: Yasakia's own id of the account — the pseudonym is computed when it leaves. */
export interface PendingEvent {
  id: string;
  accountId: string;
  kind: AnalyticsKind;
  value: number | null;
  at: string;
}

/** The event as it leaves for Orazaka. */
export interface AnalyticsEvent {
  id: string;
  subject: string;
  kind: AnalyticsKind;
  item: null;
  owner: null;
  value: number | null;
  at: string;
}

/** The person as Orazaka knows them: stable, not reversible without the key, recomputable for an erasure. */
export function pseudonymOf(accountId: string, key: string): string {
  return createHmac("sha256", key).update(`yasakia-account:${accountId}`).digest("hex");
}

/** A pending event as it leaves — pure. */
export function toAnalyticsEvent(pending: PendingEvent, key: string): AnalyticsEvent {
  return { id: pending.id, subject: pseudonymOf(pending.accountId, key), kind: pending.kind, item: null, owner: null, value: pending.value, at: pending.at };
}

/** The delay before attempt `attempts + 1`: doubling from 15 s, capped at an hour. */
export function retryDelaySeconds(attempts: number): number {
  // @fixed: a technical backoff of a background loop, not a business parameter
  const base = 15;
  // @fixed: same
  const cap = 3600;
  return Math.min(cap, base * 2 ** Math.max(0, attempts));
}

type Executor = Pick<typeof db, "insert">;

/** Records an event for the analytics (in the caller's transaction when it passes one). Never fails the action. */
export async function recordAnalytics(accountIds: string | string[], kind: AnalyticsKind, at: Date, value: number | null = null, exec: Executor = db): Promise<void> {
  const ids = Array.isArray(accountIds) ? accountIds : [accountIds];
  try {
    await exec.insert(analyticsOutbox).values(
      ids.map((accountId) => {
        const id = crypto.randomUUID();
        return { id, kind: OutboxKind.Event, payload: { id, accountId, kind, value, at: at.toISOString() } satisfies PendingEvent as unknown as Record<string, unknown> };
      }),
    );
  } catch (error) {
    console.warn("[analytics] not recorded:", (error as Error).message);
  }
}

/** Forgets an account at Orazaka (its pseudonym) — and drops its events still waiting here, so none is sent after. */
export async function recordErasure(accountId: string): Promise<void> {
  await db.delete(analyticsOutbox).where(and(isNull(analyticsOutbox.sentAt), eq(analyticsOutbox.kind, OutboxKind.Event), sql`${analyticsOutbox.payload}->>'accountId' = ${accountId}`));
  await db.insert(analyticsOutbox).values({ kind: OutboxKind.Erasure, payload: { accountId } });
}

// ── sending ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AnalyticsConnection {
  url: string;
  key: string;
  pseudonymKey: string;
  timeoutMs: number;
}

const IngestSchema = z.object({ accepted: z.number().int(), duplicates: z.number().int() });

async function post(conn: AnalyticsConnection, path: string, body: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(`${conn.url.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${conn.key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(conn.timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`orazaka_${response.status}`);
  return response.json();
}

// @fixed: a technical lease — how long a claimed row is hidden from the other instances while it is sent
const LEASE_SECONDS = 120;
// @fixed: the largest batch the analytics endpoint accepts (ADR-081)
const BATCH = 500;
// @fixed: the attempts after which a row is left for an operator to look at
const MAX_ATTEMPTS = 20;

/** A timestamp as the driver returns it (a Date, or the text of a timestamptz) as a Date. */
export function asDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value).replace(" ", "T").replace(/\+00$/, "Z"));
  if (Number.isNaN(date.getTime())) throw new Error("not a timestamp");
  return date;
}

/**
 * The parameters of the claim, as ISO-8601 text: a raw `sql` template hands a Date to the driver as its
 * `toString()` (« Sat Oct 17 2026 … GMT+0000 (Coordinated Universal Time) »), which PostgreSQL refuses — measured on dev.
 */
export function claimWindow(now: Date): { leaseUntil: string; claimAt: string } {
  return { leaseUntil: addSeconds(now, LEASE_SECONDS).toISOString(), claimAt: now.toISOString() };
}

type Claimed = { id: string; kind: OutboxKind; payload: Record<string, unknown>; attempts: number };

/** One round: claims a batch, sends the events in one call and each erasure in its own, records the outcome, prunes. */
export async function drainAnalytics(conn: AnalyticsConnection, at?: Date, fetchImpl: typeof fetch = fetch): Promise<{ sent: number; erased: number; failed: number }> {
  // The outbox's clock is the database's: every instance agrees on it, and the loop needs no ambient clock.
  const now = at ?? asDate((await db.execute<{ now: unknown }>(sql`select now() as now`)).rows[0].now);
  const { leaseUntil, claimAt } = claimWindow(now);
  const claimed = await db.execute<Claimed>(sql`
    update analytics_outbox set next_attempt_at = ${leaseUntil}::timestamptz
    where id in (
      select id from analytics_outbox
      where sent_at is null and next_attempt_at <= ${claimAt}::timestamptz and attempts < ${MAX_ATTEMPTS}
      order by created_at
      limit ${BATCH}
      for update skip locked)
    returning id, kind, payload, attempts`);
  const rows = claimed.rows;
  const summary = { sent: 0, erased: 0, failed: 0 };
  const events = rows.filter((r) => r.kind === OutboxKind.Event);
  if (events.length > 0) {
    try {
      IngestSchema.parse(await post(conn, "/api/v1/analytics/events", { events: events.map((r) => toAnalyticsEvent(r.payload as unknown as PendingEvent, conn.pseudonymKey)) }, fetchImpl));
      await db.update(analyticsOutbox).set({ sentAt: now, lastError: null }).where(inArray(analyticsOutbox.id, events.map((r) => r.id)));
      summary.sent = events.length;
    } catch (error) {
      summary.failed += events.length;
      await failed(events, now, (error as Error).message);
    }
  }
  for (const row of rows.filter((r) => r.kind === OutboxKind.Erasure)) {
    try {
      await post(conn, "/api/v1/analytics/erasures", { subjects: [pseudonymOf(String(row.payload.accountId), conn.pseudonymKey)] }, fetchImpl);
      await db.update(analyticsOutbox).set({ sentAt: now, lastError: null, payload: {} }).where(eq(analyticsOutbox.id, row.id));
      summary.erased += 1;
    } catch (error) {
      summary.failed += 1;
      await failed([row], now, (error as Error).message);
    }
  }
  // Sent rows hold an account id: kept a week as the operator's proof, then pruned.
  await db.delete(analyticsOutbox).where(and(isNotNull(analyticsOutbox.sentAt), lt(analyticsOutbox.sentAt, addDays(now, -7))));
  return summary;
}

async function failed(rows: Claimed[], now: Date, message: string) {
  const code = message.slice(0, 40);
  for (const row of rows) {
    await db
      .update(analyticsOutbox)
      .set({ attempts: row.attempts + 1, nextAttemptAt: addSeconds(now, retryDelaySeconds(row.attempts)), lastError: code })
      .where(eq(analyticsOutbox.id, row.id));
  }
}

// ── reading (the console) ───────────────────────────────────────────────────────────────────────────────────────────

const FigureSchema = z.object({ current: z.number(), previous: z.number(), change: z.number().nullable() });
export const InsightsSchema = z.object({
  minAudience: z.number(),
  suppressed: z.boolean(),
  events: FigureSchema.nullable(),
  activeSubjects: FigureSchema.nullable(),
  kinds: z.array(z.object({ kind: z.string(), unit: z.string(), count: FigureSchema, subjects: z.number(), valueSum: z.number().nullable(), valueMean: z.number().nullable() })),
  series: z.array(z.object({ day: z.string(), suppressed: z.boolean(), activeSubjects: z.number().nullable(), events: z.record(z.string(), z.number()) })),
  cohorts: z.array(z.object({ week: z.string(), size: z.number(), retention: z.array(z.number()) })),
});
export type Insights = z.infer<typeof InsightsSchema>;
export const FunnelSchema = z.object({
  minAudience: z.number(),
  steps: z.array(z.object({ kind: z.string(), suppressed: z.boolean(), subjects: z.number().nullable(), fromPrevious: z.number().nullable(), fromFirst: z.number().nullable() })),
});
export type Funnel = z.infer<typeof FunnelSchema>;

/** The loop's funnel: a batch opened → a candidate answered → an introduction started. */
export const LOOP_FUNNEL: readonly AnalyticsKind[] = [AnalyticsKind.BatchOpen, AnalyticsKind.BatchAnswer, AnalyticsKind.IntroStart];

async function get<T>(conn: AnalyticsConnection, path: string, schema: z.ZodType<T>, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(`${conn.url.replace(/\/+$/, "")}${path}`, {
    headers: { authorization: `Bearer ${conn.key}` },
    signal: AbortSignal.timeout(conn.timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`orazaka_${response.status}`);
  return schema.parse(await response.json());
}

/** The product's analytics over `[from, to)` (dates `YYYY-MM-DD`): the insights and the loop's funnel. */
export async function productAnalytics(conn: AnalyticsConnection, from: string, to: string, fetchImpl: typeof fetch = fetch): Promise<{ insights: Insights; funnel: Funnel }> {
  const range = `from=${from}&to=${to}`;
  const [insights, funnel] = await Promise.all([
    get(conn, `/api/v1/analytics/insights?${range}`, InsightsSchema, fetchImpl),
    get(conn, `/api/v1/analytics/funnel?steps=${LOOP_FUNNEL.join(",")}&${range}`, FunnelSchema, fetchImpl),
  ]);
  return { insights, funnel };
}

/** A figure's count for a kind, `null` when under the audience threshold (Orazaka left it out). */
export function kindCount(insights: Insights, kind: AnalyticsKind): { value: number | null; previous: number | null } {
  const k = insights.kinds.find((x) => x.kind === kind);
  return k ? { value: k.count.current, previous: k.count.previous } : { value: null, previous: null };
}
