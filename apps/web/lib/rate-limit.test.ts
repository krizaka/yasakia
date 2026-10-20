import { afterEach, describe, expect, it } from "vitest";

import { enforceRateLimit, MAX_KEYS, memoryStore, RateLimitError, useRateLimitStore } from "./rate-limit";

afterEach(() => useRateLimitStore(null));

describe("rate limits", () => {
  it("count per window and start a new one when it ends", async () => {
    const store = memoryStore();
    expect((await store.hit("k", 60, 0)).count).toBe(1);
    expect((await store.hit("k", 60, 1000)).count).toBe(2);
    expect((await store.hit("k", 60, 61_000)).count).toBe(1);
  });

  it("refuse past the limit with 429, a stable code and Retry-After", async () => {
    useRateLimitStore(memoryStore());
    await enforceRateLimit("code:ada", 2, 60);
    await enforceRateLimit("code:ada", 2, 60);
    const error = await enforceRateLimit("code:ada", 2, 60).catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.status).toBe(429);
    expect(error.extra.code).toBe("RATE_LIMITED");
    expect(Number(error.headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("let the request through when the store fails (a limiter outage never takes the API down)", async () => {
    useRateLimitStore({ name: "broken", hit: async () => Promise.reject(new Error("down")) });
    await expect(enforceRateLimit("k", 1, 60)).resolves.toBeUndefined();
  });

  // krizaka/yasakia#81: filling the store with distinct keys must not give a blocked caller a fresh count.
  describe("the memory store under a flood of distinct keys", () => {
    const T0 = 1_000_000;

    it("keeps a blocked caller blocked", async () => {
      const store = memoryStore();
      for (let i = 0; i < 3; i += 1) await store.hit("attacker", 3600, T0);
      for (let i = 0; i < MAX_KEYS + 50; i += 1) await store.hit(`noise-${i}`, 3600, T0 + 1);
      expect((await store.hit("attacker", 3600, T0 + 2)).count).toBe(4);
    });

    it("limits the flood itself: new keys past the bound share one window", async () => {
      const store = memoryStore();
      for (let i = 0; i < MAX_KEYS; i += 1) await store.hit(`fill-${i}`, 3600, T0);
      const counts = [];
      for (let i = 0; i < 5; i += 1) counts.push((await store.hit(`late-${i}`, 3600, T0 + 1)).count);
      expect(counts).toEqual([1, 2, 3, 4, 5]);
    });

    it("frees the room of windows that have ended", async () => {
      const store = memoryStore();
      for (let i = 0; i < MAX_KEYS; i += 1) await store.hit(`old-${i}`, 60, T0);
      expect((await store.hit("fresh", 60, T0 + 120_000)).count).toBe(1);
      expect((await store.hit("fresh", 60, T0 + 120_001)).count).toBe(2);
    });
  });
});
