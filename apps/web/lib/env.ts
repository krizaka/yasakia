/**
 * Runtime configuration. Every secret is read lazily (so `next build` needs none of them) and is mandatory in
 * production: a missing value fails the request with a ConfigurationError (503) instead of running on a placeholder,
 * and `assertProductionConfig` (instrumentation.ts) refuses to start a production server without the secrets every
 * request needs. Development defaults exist only outside production.
 */
import { keyring } from "@yasakia/db";

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
  const secret = read("AUTH_SESSION_SECRET", "development-only-yasakia-session-secret-0123456789", env);
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

/** True on a dev deployment (`NEXT_PUBLIC_APP_ENV=dev`): the only place where e-mail and photo storage may be left unconfigured. */
export function isDevDeployment(env: Env = process.env): boolean {
  return env.NEXT_PUBLIC_APP_ENV?.trim() === "dev";
}

/**
 * May a stranger create an account? `AUTH_SIGNUP_ENABLED`, **false unless it says `true`** — decided by the server,
 * whatever any client shows: the e-mail-code flow then signs existing people in and creates nobody.
 */
export function signupEnabled(env: Env = process.env): boolean {
  return env.AUTH_SIGNUP_ENABLED?.trim().toLowerCase() === "true";
}

/** The path the app is served under (`/app` on dev.yasakia.com), empty at the root. Read at build time. */
export function basePath(env: Env = process.env): string {
  const raw = env.NEXT_PUBLIC_APP_BASE_PATH?.trim() ?? "";
  return raw && raw !== "/" ? `/${raw.replace(/^\/+|\/+$/g, "")}` : "";
}

/**
 * The addresses the administration console answers (`AUTH_ALLOWED_IPS`, comma separated). Empty: every address outside
 * production, **nobody** in production (fail-closed). A console that is not on the list does not exist (404).
 */
export function consoleAllowedIps(env: Env = process.env): string[] | null {
  const list = (env.AUTH_ALLOWED_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length) return list;
  return isProduction(env) ? [] : null;
}

export type MediaConfig =
  | { driver: "none" }
  | { driver: "local"; dir: string }
  | { driver: "bunny"; zone: string; apiKey: string; endpoint: string; pullZoneHostname: string; tokenKey: string };

/**
 * Where photos live (`MEDIA_STORAGE_PROVIDER`): `bunny` — Bunny Storage zone + a pull zone with token authentication and the
 * Optimizer — or `local` (a folder, development and tests only). Production is bunny or nothing (fail-closed).
 */
export function mediaConfig(env: Env = process.env): MediaConfig {
  const driver = env.MEDIA_STORAGE_PROVIDER?.trim().toLowerCase() || (isProduction(env) ? "bunny" : "local");
  // A dev deployment may run without photo storage: the photo routes then answer 503, nothing is faked.
  if (driver === "none") {
    if (!isDevDeployment(env)) throw new ConfigurationError("MEDIA_STORAGE_PROVIDER", "may be none only on a dev deployment (NEXT_PUBLIC_APP_ENV=dev)");
    return { driver: "none" };
  }
  if (driver === "local") {
    if (isProduction(env)) throw new ConfigurationError("MEDIA_STORAGE_PROVIDER", "must be bunny in production (container disks are not storage)");
    return { driver: "local", dir: env.MEDIA_STORAGE_LOCAL_DIR?.trim() || defaultLocalDir() };
  }
  if (driver !== "bunny") throw new ConfigurationError("MEDIA_STORAGE_PROVIDER", "must be bunny, local or none");
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
  return { kind, redisUrl, prefix: env.REALTIME_PREFIX?.trim() || "yasakia:rt:", streamMaxSeconds: setting("REALTIME_STREAM_MAX_SECONDS", 300, 0, 3600, env) };
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
    if (env.MAIL_PROVIDER?.trim() === "none" && isDevDeployment(env)) return; // dev deployment: no e-mail yet, the code flow answers 503
    if (env.MAIL_PROVIDER?.trim() !== "mailgun") throw new ConfigurationError("MAIL_PROVIDER", "must be mailgun in production (the sign-in codes)");
    if (!(env.MAIL_API_KEY?.trim() && env.MAIL_DOMAIN?.trim())) throw new ConfigurationError("MAIL_API_KEY and MAIL_DOMAIN", "are required in production (the sign-in codes)");
  });
  problems.push(...schemaProblems(env));
  if (problems.length) throw new ConfigurationError("Production configuration", `is incomplete — ${problems.join("; ")}`);
}
