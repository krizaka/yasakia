import { afterEach, describe, expect, it, vi } from "vitest";

type Client = typeof import("./client");
const holder = globalThis as unknown as { __yazakiaDb?: unknown; __yazakiaDbCreated?: number };

/** A fresh copy of the module, as Next.js loads one per module graph (pages, route handlers, instrumentation). */
async function freshModule(): Promise<Client> {
  vi.resetModules();
  return import("./client");
}

afterEach(async () => {
  const { closeDb } = await import("./client");
  await closeDb();
  holder.__yazakiaDbCreated = undefined;
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
    const { poolSize, DEFAULT_POOL_SIZE, getPool } = await freshModule();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(DEFAULT_POOL_SIZE).toBe(5);
    expect(poolSize(undefined)).toBe(5);
    expect(poolSize(" ")).toBe(5);
    expect(poolSize("3")).toBe(3);
    expect(poolSize("0")).toBe(5);
    expect(poolSize("ten")).toBe(5);
    expect(poolSize("500")).toBe(50);
    vi.stubEnv("DATABASE_MAX_CONNECTIONS", "2");
    expect(getPool().options.max).toBe(2);
    expect(getPool().options.idleTimeoutMillis).toBe(10_000);
    expect((getPool().options as { application_name?: string }).application_name).toBe("yazakia-web");
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
