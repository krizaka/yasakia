import type { PoolConfig } from "pg";

/** The local development database (deploy/docker/docker-compose.dev.yml, port 5435). */
export const DEV_DATABASE_URL = "postgresql://yazakia_user:yazakia_secret@localhost:5435/yazakia_db?sslmode=disable";

/**
 * The names Yazakia's connections carry (`application_name`, visible in `pg_stat_activity`): what holds a slot is
 * always known — the web pool, the LISTEN connection of the realtime bus, the release job's migrator.
 */
export const CONNECTION_NAMES = {
  web: "yazakia-web",
  listen: "yazakia-listen",
  migrate: "yazakia-migrate",
  seed: "yazakia-seed",
} as const;

/** DATABASE_URL — the pooled connection of the app. Mandatory in production; the local default exists for development only. */
export function databaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (url) return url;
  if (env.NODE_ENV === "production") throw new Error("DATABASE_URL is required in production");
  return DEV_DATABASE_URL;
}

/**
 * DATABASE_DIRECT_URL — a direct (session) connection, for what a transaction pooler breaks: the realtime bus's LISTEN
 * (the subscription lives as long as its session) and the migrations. Optional: without it, DATABASE_URL is used, which
 * must then be direct too (it is on the default DigitalOcean setup).
 */
export function directDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.DATABASE_DIRECT_URL?.trim() || databaseUrl(env);
}

/**
 * Connection settings for a URL. Managed PostgreSQL (DigitalOcean) signs its certificate with its own CA: pg treats
 * `sslmode=require` as `verify-full`, so without that CA every connection fails with SELF_SIGNED_CERT_IN_CHAIN. When
 * DATABASE_CA_CERT holds the CA (on App Platform: `${<db>.CA_CERT}`), the server certificate is verified against it.
 * The URL's own `sslmode` is dropped then, because pg lets a parsed connection string override `ssl`.
 */
export function connectionConfig(connectionString: string, applicationName?: string, env: Record<string, string | undefined> = process.env): PoolConfig {
  const named = applicationName ? { application_name: applicationName } : {};
  const ca = env.DATABASE_CA_CERT?.trim();
  if (!ca) return { connectionString, ...named };
  const url = new URL(connectionString);
  for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) {
    url.searchParams.delete(key);
  }
  return { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true }, ...named };
}
