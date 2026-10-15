import { describe, expect, it, vi } from "vitest";

const pool = { options: { max: 4 }, totalCount: 4, idleCount: 4, waitingCount: 0 };
vi.mock("@yasakia/db", () => ({
  getPool: () => pool,
  db: {
    // The measuring query itself takes a connection: the pool's counters move while it runs.
    execute: async () => {
      pool.idleCount = 0;
      pool.waitingCount = 2;
      return { rows: [{ open: "3", role_limit: -1, server_limit: "25" }] };
    },
  },
  accountDeletions: {},
  auditLog: {},
  profilePhotos: {},
  reports: {},
}));

import { connectionBudget } from "./operations";

describe("the pool is measured before the measuring reads load it", () => {
  it("reports what the instance held when the page asked, not what the page's own query held", async () => {
    const out = await connectionBudget();
    expect(out.pool).toEqual({ max: 4, total: 4, idle: 4, waiting: 0 });
    expect(out).toMatchObject({ open: 3, limit: 25 });
  });
});
