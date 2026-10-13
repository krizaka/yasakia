import { describe, expect, it } from "vitest";

import { adminAllowedIps, assertProductionConfig, ConfigurationError, mediaConfig, realtimeConfig, sessionSecret } from "./env";

const prodSecrets = {
  NODE_ENV: "production",
  AUTH_SESSION_SECRET: "x".repeat(40),
  DATABASE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  DATABASE_URL: "postgres://db/yazakia",
  MEDIA_STORAGE_PROVIDER: "bunny",
  MEDIA_STORAGE_ZONE: "yazakia",
  MEDIA_STORAGE_API_KEY: "k",
  MEDIA_CDN_HOSTNAME: "yazakia.b-cdn.net",
  MEDIA_CDN_TOKEN_AUTH_KEY: "t",
  MAIL_PROVIDER: "mailgun",
  MAIL_API_KEY: "m",
  MAIL_DOMAIN: "mg.yazakia.com",
};

describe("fail-closed configuration", () => {
  it("development has defaults; production has none", () => {
    expect(sessionSecret({})).toMatch(/development-only/);
    expect(() => sessionSecret({ NODE_ENV: "production" })).toThrow(ConfigurationError);
    expect(() => sessionSecret({ AUTH_SESSION_SECRET: "short" })).toThrow(/32 characters/);
  });

  it("photos: local storage in development only; Bunny needs all of its settings", () => {
    expect(mediaConfig({}).driver).toBe("local");
    expect(() => mediaConfig({ NODE_ENV: "production", MEDIA_STORAGE_PROVIDER: "local" })).toThrow(/must be bunny in production/);
    expect(() => mediaConfig({ NODE_ENV: "production" })).toThrow(/MEDIA_STORAGE_ZONE/);
    expect(mediaConfig(prodSecrets)).toMatchObject({ driver: "bunny", endpoint: "storage.bunnycdn.com", pullZoneHostname: "yazakia.b-cdn.net" });
  });

  it("a production server refuses to start without what every request needs — and names it", () => {
    expect(() => assertProductionConfig(prodSecrets)).not.toThrow();
    expect(() => assertProductionConfig({ NODE_ENV: "development" })).not.toThrow();
    for (const name of ["AUTH_SESSION_SECRET", "DATABASE_ENCRYPTION_KEY", "DATABASE_URL", "MEDIA_CDN_TOKEN_AUTH_KEY", "MAIL_PROVIDER", "MAIL_API_KEY"]) {
      expect(() => assertProductionConfig({ ...prodSecrets, [name]: "" })).toThrow(new RegExp(name));
    }
  });

  it("realtime: postgres by default, redis only with a URL", () => {
    expect(realtimeConfig({})).toMatchObject({ kind: "postgres", prefix: "yazakia:rt:", streamMaxSeconds: 300 });
    expect(() => realtimeConfig({ REALTIME_BUS: "redis" })).toThrow(/REALTIME_REDIS_URL/);
    expect(realtimeConfig({ REALTIME_BUS: "redis", REALTIME_REDIS_URL: "redis://r" }).redisUrl).toBe("redis://r");
    expect(() => realtimeConfig({ REALTIME_BUS: "kafka" })).toThrow(ConfigurationError);
  });

  it("the admin allow-list: open outside production when empty, closed in production", () => {
    expect(adminAllowedIps({})).toBeNull();
    expect(adminAllowedIps({ NODE_ENV: "production" })).toEqual([]);
    expect(adminAllowedIps({ OPERATOR_ALLOWED_IPS: " 203.0.113.7, 198.51.100.1 " })).toEqual(["203.0.113.7", "198.51.100.1"]);
  });
});

describe("ENV_VARS — every variable named by its bounded context (krizaka/.github#46)", () => {
  const FRAMEWORK = new Set(["NODE_ENV", "PORT", "HOSTNAME", "NEXT_PHASE", "NEXT_RUNTIME", "NEXT_PUBLIC_APP_VERSION", "NEXT_DIST_DIR", "CI"]);
  const TOOLING = new Set(["APP_URL", "DATABASE_MIGRATIONS_DIR", "REALTIME_IT"]);
  const CONTEXT = /^(NEXT_PUBLIC_)?(APP|DATABASE|AUTH|MEDIA|MAIL|PUSH|PAYMENTS|REALTIME|ABUSE|OBSERVABILITY|AI|OPERATOR)_[A-Z0-9_]+$/;
  const VENDOR_OR_PRODUCT = /^(NEXT_PUBLIC_|EXPO_PUBLIC_)?(YAZAKIA|KRIZAKA|BUNNY|MAILGUN|RESEND|EXPO|GOOGLE|REDIS|VERCEL|DO|DIGITALOCEAN|ADMIN)_/;

  it("names every variable <CONTEXT>_<THING>, never after a product or a vendor", async () => {
    const { ENV_VARS } = await import("./env");
    for (const e of ENV_VARS) {
      expect(e.name).toMatch(CONTEXT);
      expect(e.name).not.toMatch(VENDOR_OR_PRODUCT);
      expect(e.name.startsWith(`${e.context}_`) || e.name.startsWith(`NEXT_PUBLIC_${e.context}_`), e.name).toBe(true);
    }
    expect(new Set(ENV_VARS.map((e) => e.name)).size).toBe(ENV_VARS.length);
  });

  it("declares every variable the code, .env.example, the App Platform spec and the e2e use", async () => {
    const { execSync } = await import("node:child_process");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { ENV_VARS } = await import("./env");
    const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
    const declared = new Set(ENV_VARS.map((e) => e.name));
    const used = new Map<string, string>();
    const files = execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n").filter((f) => /\.(ts|tsx|mjs|cjs|js)$/.test(f) && !f.endsWith("env.test.ts"));
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      for (const m of src.matchAll(/\b(?:process\.env|env)(?:\.|\[["'])([A-Z][A-Z0-9_]*[A-Z0-9])\b/g)) used.set(m[1], f);
      for (const m of src.matchAll(/\b(?:setting|read|need)\("([A-Z][A-Z0-9_]+)"/g)) used.set(m[1], f);
    }
    for (const m of fs.readFileSync(path.join(root, ".env.example"), "utf8").matchAll(/^#?\s?([A-Z][A-Z0-9_]+)=/gm)) used.set(m[1], ".env.example");
    for (const m of fs.readFileSync(path.join(root, "deploy/digitalocean/app.yaml"), "utf8").matchAll(/key: ([A-Z][A-Z0-9_]+)/g)) used.set(m[1], "app.yaml");
    const undeclared = [...used].filter(([n]) => !declared.has(n) && !FRAMEWORK.has(n) && !TOOLING.has(n)).map(([n, f]) => `${n} (${f})`);
    expect(undeclared.join(", ")).toBe("");
    for (const name of TOOLING) if (name !== "REALTIME_IT") expect(name).toMatch(CONTEXT);
  });

  it("checks every value set against its schema before production starts — names only", () => {
    expect(() => assertProductionConfig({ ...prodSecrets, DATABASE_MAX_CONNECTIONS: "500" })).toThrow(/DATABASE_MAX_CONNECTIONS/);
    expect(() => assertProductionConfig({ ...prodSecrets, MAIL_PROVIDER: "postmark" })).toThrow(/MAIL_PROVIDER/);
    expect(() => assertProductionConfig({ ...prodSecrets, REALTIME_REDIS_URL: "not a url" })).toThrow(/REALTIME_REDIS_URL/);
    expect(() => assertProductionConfig({ ...prodSecrets, REALTIME_REDIS_URL: "not a url" })).not.toThrow(/not a url/);
  });
});
