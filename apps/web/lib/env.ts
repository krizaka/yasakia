/**
 * Runtime configuration. Every secret is read lazily (so `next build` needs none of them) and is mandatory in
 * production: a missing value fails the request with a ConfigurationError (503) instead of running on a placeholder,
 * and `assertProductionConfig` (instrumentation.ts) refuses to start a production server without the secrets every
 * request needs. Development defaults exist only outside production.
 */
import { keyring } from "@yazakia/db";

import { schemaProblems } from "./env-vars";

export { ENV_CONTEXTS, ENV_VARS, type EnvVar } from "./env-vars";

type Env = Record<string, string | undefined>;

export class ConfigurationError extends Error {
  constructor(name: string, detail = "is required in production") {
    super(`${name} ${detail}`);
    this.name = "ConfigurationError";
  }
}

export function isProduction(env: Env = process.env): boolean {
  return env.NODE_ENV === "production";
}

function read(name: string, developmentDefault: string, env: Env = process.env): string {
  const value = env[name]?.trim();
  if (value) return value;
  if (isProduction(env)) throw new ConfigurationError(name);
  return developmentDefault;
}

/** Signs the session tokens (and, derived, the media URLs). At least 32 characters. */
export function sessionSecret(env: Env = process.env): string {
  const secret = read("AUTH_SESSION_SECRET", "development-only-yazakia-session-secret-0123456789", env);
  if (secret.length < 32) throw new ConfigurationError("AUTH_SESSION_SECRET", "must be at least 32 characters");
  return secret;
}

/** The public origin of the API (signed upload URLs and local media URLs are built on it). */
export function appUrl(env: Env = process.env): string {
  return read("NEXT_PUBLIC_APP_URL", "http://localhost:3000", env).replace(/\/$/, "");
}

/** A whole number from the environment within bounds, or its default (tuning, not secrets). */
export function setting(name: string, fallback: number, min: number, max: number, env: Env = process.env): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new ConfigurationError(name, `must be a whole number from ${min} to ${max}`);
  return value;
}

export type MediaConfig =
  | { driver: "local"; dir: string }
  | { driver: "bunny"; zone: string; apiKey: string; endpoint: string; pullZoneHostname: string; tokenKey: string };

/**
 * Where photos live (`MEDIA_STORAGE_PROVIDER`): `bunny` — Bunny Storage zone + a pull zone with token authentication and the
 * Optimizer — or `local` (a folder, development and tests only). Production is bunny or nothing (fail-closed).
 */
export function mediaConfig(env: Env = process.env): MediaConfig {
  const driver = env.MEDIA_STORAGE_PROVIDER?.trim().toLowerCase() || (isProduction(env) ? "bunny" : "local");
  if (driver === "local") {
    if (isProduction(env)) throw new ConfigurationError("MEDIA_STORAGE_PROVIDER", "must be bunny in production (container disks are not storage)");
    return { driver: "local", dir: env.MEDIA_STORAGE_LOCAL_DIR?.trim() || defaultLocalDir() };
  }
  if (driver !== "bunny") throw new ConfigurationError("MEDIA_STORAGE_PROVIDER", "must be bunny or local");
  const need = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new ConfigurationError(name, "is required with MEDIA_STORAGE_PROVIDER=bunny");
    return value;
  };
  return {
    driver: "bunny",
    zone: need("MEDIA_STORAGE_ZONE"),
    apiKey: need("MEDIA_STORAGE_API_KEY"),
    endpoint: env.MEDIA_STORAGE_ENDPOINT?.trim() || "storage.bunnycdn.com",
    pullZoneHostname: need("MEDIA_CDN_HOSTNAME"),
    tokenKey: need("MEDIA_CDN_TOKEN_AUTH_KEY"),
  };
}

/** `.storage/` at the repository root (the web app runs from apps/web in development). */
function defaultLocalDir(): string {
  const cwd = process.cwd();
  return cwd.endsWith("/apps/web") ? `${cwd.slice(0, -"/apps/web".length)}/.storage` : `${cwd}/.storage`;
}

export interface RealtimeConfig {
  kind: "memory" | "postgres" | "redis";
  redisUrl?: string;
  prefix: string;
  /** A stream ends after this long and the client reconnects (seconds, 0: never). */
  streamMaxSeconds: number;
}

/**
 * The realtime bus (`REALTIME_BUS`): `postgres` (default — LISTEN/NOTIFY, no extra service), `redis` (Redis / Valkey at
 * `REALTIME_REDIS_URL`, for several instances and many streams) or `memory` (one process: tests). Fail-closed: `redis` without a
 * URL is a configuration error, never a silent fallback.
 */
export function realtimeConfig(env: Env = process.env): RealtimeConfig {
  const kind = (env.REALTIME_BUS?.trim().toLowerCase() || "postgres") as RealtimeConfig["kind"];
  if (kind !== "memory" && kind !== "postgres" && kind !== "redis") throw new ConfigurationError("REALTIME_BUS", "must be memory, postgres or redis");
  const redisUrl = env.REALTIME_REDIS_URL?.trim() || undefined;
  if (kind === "redis" && !redisUrl) throw new ConfigurationError("REALTIME_REDIS_URL", "is required when REALTIME_BUS=redis");
  return { kind, redisUrl, prefix: env.REALTIME_PREFIX?.trim() || "yazakia:rt:", streamMaxSeconds: setting("REALTIME_STREAM_MAX_SECONDS", 300, 0, 3600, env) };
}

/** The operators' service token (32+ characters) — without it, no admin route answers. */
export function adminToken(env: Env = process.env): string | null {
  const token = env.OPERATOR_API_TOKEN?.trim();
  return token && token.length >= 32 ? token : null;
}

/** The addresses the admin API answers (comma separated). Empty: every address outside production, none in production. */
export function adminAllowedIps(env: Env = process.env): string[] | null {
  const list = (env.OPERATOR_ALLOWED_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length) return list;
  return isProduction(env) ? [] : null;
}

/**
 * Refuses to start a production server that would fail every request, or run without what protects the data: the
 * session secret, the data encryption key, the database, the media storage and the e-mail of the sign-in codes.
 */
export function assertProductionConfig(env: Env = process.env): void {
  if (!isProduction(env)) return;
  const problems: string[] = [];
  const attempt = (check: () => unknown) => {
    try {
      check();
    } catch (error) {
      problems.push((error as Error).message);
    }
  };
  attempt(() => sessionSecret(env));
  attempt(() => keyring(env));
  attempt(() => {
    if (!env.DATABASE_URL?.trim()) throw new ConfigurationError("DATABASE_URL");
  });
  attempt(() => mediaConfig(env));
  attempt(() => realtimeConfig(env));
  attempt(() => {
    if (env.MAIL_PROVIDER?.trim() !== "mailgun") throw new ConfigurationError("MAIL_PROVIDER", "must be mailgun in production (the sign-in codes)");
    if (!(env.MAIL_API_KEY?.trim() && env.MAIL_DOMAIN?.trim())) throw new ConfigurationError("MAIL_API_KEY and MAIL_DOMAIN", "are required in production (the sign-in codes)");
  });
  problems.push(...schemaProblems(env));
  if (problems.length) throw new ConfigurationError("Production configuration", `is incomplete — ${problems.join("; ")}`);
}
