import { afterEach, describe, expect, it } from "vitest";

import { enforceRateLimit, memoryStore, RateLimitError, useRateLimitStore } from "./rate-limit";

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
});
