import { afterEach, describe, expect, it, vi } from "vitest";

type Client = typeof import("./client");
const holder = globalThis as unknown as { __yasakiaDb?: unknown; __yasakiaDbCreated?: number };

/** A fresh copy of the module, as Next.js loads one per module graph (pages, route handlers, instrumentation). */
async function freshModule(): Promise<Client> {
  vi.resetModules();
  return import("./client");
}

afterEach(async () => {
  const { closeDb } = await import("./client");
  await closeDb();
  holder.__yasakiaDbCreated = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the database pool", () => {
  it("is one per process, however many copies of the module are loaded", async () => {
    const first = await freshModule();
    const second = await freshModule();
    expect(first).not.toBe(second);
    first.getDb();
    second.getDb();
    void second.db.select;
    expect(first.getPool()).toBe(second.getPool());
    expect(second.poolsCreated()).toBe(1);
  });

  it("is small by default and sized from DATABASE_MAX_CONNECTIONS", async () => {
    const { poolSize, getPool } = await freshModule();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const prod = { NODE_ENV: "production" };
    expect(poolSize(undefined, prod)).toBe(5);
    expect(poolSize(" ", prod)).toBe(5);
    expect(poolSize("3", prod)).toBe(3);
    expect(poolSize("0", prod)).toBe(5);
    expect(poolSize("ten", prod)).toBe(5);
    expect(poolSize("500", prod)).toBe(50);
    vi.stubEnv("DATABASE_MAX_CONNECTIONS", "2");
    expect(getPool().options.max).toBe(2);
    expect(getPool().options.idleTimeoutMillis).toBe(10_000);
    expect((getPool().options as { application_name?: string }).application_name).toBe("yasakia-web");
  });

  // yasakia#125: CI runs two development servers on one database (the open one and the sign-up-closed one) and counted
  // 6 web connections against a cap of 5. The default is now per environment, and a bound is instances x pool size.
  it("has a default per environment: production 5, a pooler in front 10, development and tests 5", async () => {
    const { poolSize, DEFAULT_POOL_SIZE } = await freshModule();
    expect(DEFAULT_POOL_SIZE).toEqual({ production: 5, pooled: 10, development: 5 });
    expect(poolSize(undefined, { NODE_ENV: "production" })).toBe(5);
    expect(poolSize(undefined, { NODE_ENV: "production", DATABASE_DIRECT_URL: "postgresql://direct" })).toBe(10);
    expect(poolSize(undefined, { NODE_ENV: "development" })).toBe(5);
    expect(poolSize(undefined, { NODE_ENV: "test" })).toBe(5);
    expect(poolSize(undefined, {})).toBe(5);
    // A pooler never overrides an explicit value, and development never uses the pooled default.
    expect(poolSize("4", { NODE_ENV: "production", DATABASE_DIRECT_URL: "postgresql://direct" })).toBe(4);
    expect(poolSize(undefined, { NODE_ENV: "development", DATABASE_DIRECT_URL: "postgresql://direct" })).toBe(5);
  });

  it("budgets connections: instances x pool size, plus one LISTEN per instance", async () => {
    const { connectionBudget } = await freshModule();
    expect(connectionBudget({ instances: 1, poolSize: 5 })).toEqual({ web: 5, listen: 1 });
    expect(connectionBudget({ instances: 2, poolSize: 3 })).toEqual({ web: 6, listen: 2 });
  });

  it("recognises a database that refuses connections, through Drizzle's wrapping", async () => {
    const { isDatabaseUnavailable } = await freshModule();
    const refused = Object.assign(new Error("remaining connection slots are reserved"), { code: "53300" });
    expect(isDatabaseUnavailable(refused)).toBe(true);
    expect(isDatabaseUnavailable(new Error("Failed query", { cause: refused }))).toBe(true);
    expect(isDatabaseUnavailable(Object.assign(new Error("syntax error"), { code: "42601" }))).toBe(false);
    expect(isDatabaseUnavailable(undefined)).toBe(false);
  });

  it("reports an unavailable database in one line, not once per query", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://nobody:nothing@127.0.0.1:1/none?sslmode=disable");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { getPool } = await freshModule();
    const pool = getPool();
    await expect(pool.query("select 1")).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await expect(pool.query("select 1")).rejects.toMatchObject({ code: "ECONNREFUSED" });
    await expect(pool.connect()).rejects.toMatchObject({ code: "ECONNREFUSED" });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toMatch(/^\[db\] database unavailable: ECONNREFUSED/);
  });
});
