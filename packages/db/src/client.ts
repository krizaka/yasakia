import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { CONNECTION_NAMES, connectionConfig, databaseUrl } from "./connection";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

/**
 * Connections per process when DATABASE_MAX_CONNECTIONS is not set, by environment. Small on purpose: a managed
 * PostgreSQL may accept ~22 connections in all, shared by every instance, the rolling deploy's second instance, the
 * LISTEN connection of each instance and the migrate job (docs/DEPLOYMENT.md, "Database connections").
 * - `production`: 5 on a direct database.
 * - `pooled`: 10 when DATABASE_DIRECT_URL is also set, i.e. DATABASE_URL goes through a transaction pooler (PgBouncer):
 *   the pooler multiplexes them onto few server connections, so a wider client pool costs the database nothing.
 * - `development`: 3 (development, tests, CI): several servers share one local database (CI runs two).
 */
export const DEFAULT_POOL_SIZE = { production: 5, pooled: 10, development: 3 } as const;

type Env = Record<string, string | undefined>;

function defaultPoolSize(env: Env): number {
  if (env.NODE_ENV !== "production") return DEFAULT_POOL_SIZE.development;
  return env.DATABASE_DIRECT_URL?.trim() ? DEFAULT_POOL_SIZE.pooled : DEFAULT_POOL_SIZE.production;
}

/** What `instances` processes may hold on one database: their pools (`yasakia-web`) and one LISTEN each. */
export function connectionBudget({ instances, poolSize: size }: { instances: number; poolSize: number }): { web: number; listen: number } {
  return { web: instances * size, listen: instances };
}

/** Above this, a typo (500) would exhaust any database: the value is capped and a warning says so. */
const MAX_POOL_SIZE = 50;

/** DATABASE_MAX_CONNECTIONS as a positive integer (at most 50); unset or invalid: the environment's default. */
export function poolSize(value: string | undefined = process.env.DATABASE_MAX_CONNECTIONS, env: Env = process.env): number {
  const fallback = defaultPoolSize(env);
  const raw = value?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.warn(`[db] DATABASE_MAX_CONNECTIONS="${raw}" is not a positive integer: using ${fallback}`);
    return fallback;
  }
  if (parsed > MAX_POOL_SIZE) {
    console.warn(`[db] DATABASE_MAX_CONNECTIONS=${parsed} is capped at ${MAX_POOL_SIZE}`);
    return MAX_POOL_SIZE;
  }
  return parsed;
}

/**
 * PostgreSQL error codes and network errors that mean "the database is not taking connections" rather than "this
 * query is wrong": too many connections (53300), starting up / shutting down (57P01-57P03), refused, unreachable,
 * timed out.
 */
const UNAVAILABLE_CODES = new Set(["53300", "53400", "57P01", "57P02", "57P03", "08001", "08004", "08006", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"]);

/** True when the error (or its cause — Drizzle wraps the driver's error) means the database is unavailable. */
export function isDatabaseUnavailable(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    const { code, message, cause } = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof code === "string" && UNAVAILABLE_CODES.has(code)) return true;
    if (typeof message === "string" && /timeout exceeded when trying to connect|Connection terminated (unexpectedly|due to connection timeout)/i.test(message)) return true;
    current = cause;
  }
  return false;
}

interface DbHolder {
  pool: Pool;
  db: Database;
  unavailable: { lastLoggedAt: number; suppressed: number };
}

/**
 * One pool per process, kept on globalThis. Next.js loads this module in several module graphs (route handlers, pages,
 * instrumentation — each with its own copy of module-level variables): without this, a production build opens three
 * pools of DATABASE_MAX_CONNECTIONS each (measured on Orochia, 2026-10-12).
 */
const holder = globalThis as unknown as { __yasakiaDb?: DbHolder; __yasakiaDbCreated?: number };

const UNAVAILABLE_LOG_EVERY_MS = 30_000;

/** One clear line when the database refuses connections, at most every 30 s, with how many were not logged. */
function reportUnavailable(state: DbHolder["unavailable"], error: unknown, max: number): void {
  const now = Date.now();
  if (now - state.lastLoggedAt < UNAVAILABLE_LOG_EVERY_MS) {
    state.suppressed += 1;
    return;
  }
  const { code, message } = error as { code?: string; message?: string };
  const more = state.suppressed ? ` (${state.suppressed} more since the last report)` : "";
  console.error(`[db] database unavailable: ${code ?? "error"} ${message ?? ""}${more} — this instance holds at most ${max} connections (DATABASE_MAX_CONNECTIONS)`);
  state.lastLoggedAt = now;
  state.suppressed = 0;
}

function createHolder(): DbHolder {
  const max = poolSize();
  const pool = new Pool({
    ...connectionConfig(databaseUrl(), CONNECTION_NAMES.web),
    max,
    // Idle connections go back to the database quickly: a quiet instance holds none, the next one deploying has room.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    // A script that only imports the client (seed) exits when its work is done.
    allowExitOnIdle: true,
  });
  holder.__yasakiaDbCreated = (holder.__yasakiaDbCreated ?? 0) + 1;
  const state: DbHolder = { pool, db: drizzle(pool, { schema }), unavailable: { lastLoggedAt: 0, suppressed: 0 } };

  // An idle connection dropped by the server (restart, failover) must not crash the process: the pool replaces it.
  pool.on("error", (error) => {
    if (isDatabaseUnavailable(error)) reportUnavailable(state.unavailable, error, max);
    else console.error(`[db] idle connection error: ${error.message}`);
  });

  // Connection failures are reported once in a while, in one line; the query still fails (the caller decides).
  const connect = pool.connect.bind(pool) as (callback?: (...args: unknown[]) => void) => unknown;
  (pool as unknown as { connect: typeof connect }).connect = (callback) => {
    if (callback) {
      return connect((error: unknown, ...rest: unknown[]) => {
        if (error && isDatabaseUnavailable(error)) reportUnavailable(state.unavailable, error, max);
        callback(error, ...rest);
      });
    }
    return (connect() as Promise<unknown>).catch((error: unknown) => {
      if (isDatabaseUnavailable(error)) reportUnavailable(state.unavailable, error, max);
      throw error;
    });
  };
  return state;
}

function current(): DbHolder {
  if (!holder.__yasakiaDb) holder.__yasakiaDb = createHolder();
  return holder.__yasakiaDb;
}

/** The process-wide pool — for raw SQL, and the NOTIFY side of the realtime bus. */
export function getPool(): Pool {
  return current().pool;
}

export function getDb(): Database {
  return current().db;
}

/** How many pools this process created (1 once connected; read by tests and diagnostics). */
export function poolsCreated(): number {
  return holder.__yasakiaDbCreated ?? 0;
}

/** Ends the pool (tests, graceful shutdown); the next query opens a new one. */
export async function closeDb(): Promise<void> {
  const state = holder.__yasakiaDb;
  holder.__yasakiaDb = undefined;
  await state?.pool.end();
}

/**
 * Lazily connected client: importing this module never opens a connection (so `next build` and unit tests run without
 * a database); the first query does.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance as object, property, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export async function checkDbHealth(): Promise<boolean> {
  try {
    await getDb().execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    if (isDatabaseUnavailable(error)) console.error(`[db] health check: database unavailable (${(error as { code?: string }).code ?? "error"})`);
    else console.error("[db] health check failed:", error);
    return false;
  }
}
