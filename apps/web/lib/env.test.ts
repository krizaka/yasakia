import { describe, expect, it } from "vitest";

import { adminAllowedIps, assertProductionConfig, ConfigurationError, mediaConfig, realtimeConfig, sessionSecret } from "./env";

const prodSecrets = {
  NODE_ENV: "production",
  SESSION_SECRET: "x".repeat(40),
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  DATABASE_URL: "postgres://db/yazakia",
  STORAGE_DRIVER: "bunny",
  BUNNY_STORAGE_ZONE: "yazakia",
  BUNNY_STORAGE_API_KEY: "k",
  BUNNY_PULL_ZONE_HOSTNAME: "yazakia.b-cdn.net",
  BUNNY_TOKEN_AUTH_KEY: "t",
  MAILGUN_API_KEY: "m",
  MAILGUN_DOMAIN: "mg.yazakia.com",
};

describe("fail-closed configuration", () => {
  it("development has defaults; production has none", () => {
    expect(sessionSecret({})).toMatch(/development-only/);
    expect(() => sessionSecret({ NODE_ENV: "production" })).toThrow(ConfigurationError);
    expect(() => sessionSecret({ SESSION_SECRET: "short" })).toThrow(/32 characters/);
  });

  it("photos: local storage in development only; Bunny needs all of its settings", () => {
    expect(mediaConfig({}).driver).toBe("local");
    expect(() => mediaConfig({ NODE_ENV: "production", STORAGE_DRIVER: "local" })).toThrow(/must be bunny in production/);
    expect(() => mediaConfig({ NODE_ENV: "production" })).toThrow(/BUNNY_STORAGE_ZONE/);
    expect(mediaConfig(prodSecrets)).toMatchObject({ driver: "bunny", endpoint: "storage.bunnycdn.com", pullZoneHostname: "yazakia.b-cdn.net" });
  });

  it("a production server refuses to start without what every request needs — and names it", () => {
    expect(() => assertProductionConfig(prodSecrets)).not.toThrow();
    expect(() => assertProductionConfig({ NODE_ENV: "development" })).not.toThrow();
    for (const name of ["SESSION_SECRET", "DATA_ENCRYPTION_KEY", "DATABASE_URL", "BUNNY_TOKEN_AUTH_KEY", "MAILGUN_API_KEY"]) {
      expect(() => assertProductionConfig({ ...prodSecrets, [name]: "" })).toThrow(new RegExp(name));
    }
  });

  it("realtime: postgres by default, redis only with a URL", () => {
    expect(realtimeConfig({})).toMatchObject({ kind: "postgres", prefix: "yazakia:rt:", streamMaxSeconds: 300 });
    expect(() => realtimeConfig({ REALTIME_BUS: "redis" })).toThrow(/REDIS_URL/);
    expect(realtimeConfig({ REALTIME_BUS: "redis", REDIS_URL: "redis://r" }).redisUrl).toBe("redis://r");
    expect(() => realtimeConfig({ REALTIME_BUS: "kafka" })).toThrow(ConfigurationError);
  });

  it("the admin allow-list: open outside production when empty, closed in production", () => {
    expect(adminAllowedIps({})).toBeNull();
    expect(adminAllowedIps({ NODE_ENV: "production" })).toEqual([]);
    expect(adminAllowedIps({ ADMIN_ALLOWED_IPS: " 203.0.113.7, 198.51.100.1 " })).toEqual(["203.0.113.7", "198.51.100.1"]);
  });
});
