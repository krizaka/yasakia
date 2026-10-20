import { db, rateLimitBuckets } from "@yasakia/db";
import { lt, sql } from "drizzle-orm";

import { clientIp } from "./client-ip";
import { HttpError } from "./http";

/**
 * Fixed-window rate limits (sign-in codes, uploads, reports, blocks, exports…). The counters live in a
 * {@link RateLimitStore}, chosen by `ABUSE_RATE_LIMIT_STORE`:
 * - `memory` (default): per instance — counters reset on restart and are NOT shared: fine for one instance only;
 * - `postgres`: one upsert per check on `rate_limit_buckets`, shared by every instance — required before a second one.
 * A store that fails lets the request through (logged): a limiter outage must not take the API down.
 */
export interface RateLimitHit {
  count: number;
  /** Epoch milliseconds the window ends at. */
  resetAt: number;
}

export interface RateLimitStore {
  readonly name: string;
  hit(key: string, windowSeconds: number, now?: number): Promise<RateLimitHit>;
}

// @fixed: the memory bound of the in-process store, not a business parameter
export const MAX_KEYS = 10_000;
const OVERFLOW = "overflow";

export function memoryStore(): RateLimitStore {
  const windows = new Map<string, RateLimitHit>();
  return {
    name: "memory",
    async hit(key, windowSeconds, now = Date.now()) {
      let entry = windows.get(key);
      if (!entry || entry.resetAt <= now) {
        // Only ended windows may go: a live one is a refusal someone has earned.
        if (windows.size >= MAX_KEYS) for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
        // Still full of live windows (a flood of distinct keys): never clear them — that would give every blocked caller a
        // fresh count. A new key shares one overflow window instead, so the flood limits itself.
        const slot = windows.size >= MAX_KEYS ? OVERFLOW : key;
        entry = windows.get(slot);
        if (!entry || entry.resetAt <= now) {
          entry = { count: 0, resetAt: now + windowSeconds * 1000 };
          windows.set(slot, entry);
        }
      }
      entry.count += 1;
      return { ...entry };
    },
  };
}

/** Shared by every instance: `rate_limit_buckets`, one atomic upsert per hit. */
export function postgresStore(): RateLimitStore {
  return {
    name: "postgres",
    async hit(key, windowSeconds, now = Date.now()) {
      const at = new Date(now);
      const resetAt = new Date(now + windowSeconds * 1000);
      const result = await db.execute<{ count: number; reset_at: Date | string }>(sql`
        insert into rate_limit_buckets (key, count, reset_at) values (${key}, 1, ${resetAt})
        on conflict (key) do update set
          count = case when rate_limit_buckets.reset_at <= ${at} then 1 else rate_limit_buckets.count + 1 end,
          reset_at = case when rate_limit_buckets.reset_at <= ${at} then excluded.reset_at else rate_limit_buckets.reset_at end
        returning count, reset_at`);
      const row = result.rows[0];
      return { count: Number(row.count), resetAt: new Date(row.reset_at).getTime() };
    },
  };
}

const holder = globalThis as unknown as { __yasakiaRateLimit?: RateLimitStore };

/** The configured store (ABUSE_RATE_LIMIT_STORE=memory|postgres), one per process. */
export function rateLimitStore(env: Record<string, string | undefined> = process.env): RateLimitStore {
  if (holder.__yasakiaRateLimit) return holder.__yasakiaRateLimit;
  const kind = env.ABUSE_RATE_LIMIT_STORE?.trim().toLowerCase() || "memory";
  if (kind !== "memory" && kind !== "postgres") throw new Error(`ABUSE_RATE_LIMIT_STORE must be "memory" or "postgres", not "${kind}"`);
  holder.__yasakiaRateLimit = kind === "postgres" ? postgresStore() : memoryStore();
  return holder.__yasakiaRateLimit;
}

/** Tests: use this store (null: back to the configured one). */
export function useRateLimitStore(next: RateLimitStore | null) {
  holder.__yasakiaRateLimit = next ?? undefined;
}

/** Removes the windows that ended (postgres store; the background loop calls it). */
export async function sweepRateLimits(now = new Date()): Promise<number> {
  if (rateLimitStore().name !== "postgres") return 0;
  const rows = await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.resetAt, now)).returning({ key: rateLimitBuckets.key });
  return rows.length;
}

/** A refusal for too many requests: 429, the stable code RATE_LIMITED, and `Retry-After` (seconds). */
export class RateLimitError extends HttpError {
  constructor(retryAfterSeconds: number) {
    const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
    super(429, "Too many requests. Try again later.", { code: "RATE_LIMITED", retryAfterSeconds: seconds }, { "Retry-After": String(seconds) });
    this.name = "RateLimitError";
  }
}

/** Counts one request for `key`; throws {@link RateLimitError} past `limit` per `windowSeconds`. */
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = Date.now();
  let hit: RateLimitHit;
  try {
    hit = await rateLimitStore().hit(key.slice(0, 200), windowSeconds, now);
  } catch (error) {
    console.error(`rate-limit: store failed for ${key.split(":")[0]} — request allowed`, error);
    return;
  }
  if (hit.count > limit) throw new RateLimitError((hit.resetAt - now) / 1000);
}

export interface ActionLimits {
  /** [limit, window seconds] per account (or per subject: an e-mail address). */
  perSubject?: [number, number];
  /** [limit, window seconds] per IP address. */
  perIp?: [number, number];
}

/** Limits an action per subject AND per IP (rotating accounts still share an address; rotating addresses, an account). */
export async function limitAction(action: string, req: { headers: Headers }, subject: string | null, limits: ActionLimits): Promise<void> {
  if (limits.perIp) await enforceRateLimit(`${action}:ip:${clientIp(req.headers) ?? "unknown"}`, ...limits.perIp);
  if (limits.perSubject && subject) await enforceRateLimit(`${action}:s:${subject}`, ...limits.perSubject);
}
