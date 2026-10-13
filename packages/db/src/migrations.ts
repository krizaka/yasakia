import type { Pool, PoolClient } from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";

/**
 * The migration journal and the one destructive operation on it, used by the release job (migrate.ts).
 *
 * drizzle's migrator, minus its `CREATE SCHEMA IF NOT EXISTS`: PostgreSQL checks the CREATE privilege on the database
 * even when the schema exists, and a DigitalOcean dev database denies it. Same journal (`public.__drizzle_migrations`,
 * also read by drizzle-kit), same rule: every migration newer than the last applied one runs, all in one transaction.
 */

type Migration = ReturnType<typeof readMigrationFiles>[number];

export function loadMigrations(folder: string): Migration[] {
  return readMigrationFiles({ migrationsFolder: folder });
}

const JOURNAL = `CREATE TABLE IF NOT EXISTS public.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`;

/**
 * Where the database stands against the migrations shipped with this release:
 * - `empty`: nothing applied yet;
 * - `current` / `behind`: every applied migration is one of ours (`pending` still to apply);
 * - `rewritten`: it applied migrations this release does not have — the history was squashed (a new baseline). Such a
 *   database cannot be migrated forward: it must be reset (development) or migrated by hand (never in production).
 */
export type HistoryState = { kind: "empty" | "current" | "behind" | "rewritten"; applied: number; pending: number; known: number; lastAppliedAt: Date | null };

export async function historyState(client: Pool | PoolClient, migrations: Migration[]): Promise<HistoryState> {
  const exists = await client.query<{ ok: boolean }>(`SELECT to_regclass('public.__drizzle_migrations') IS NOT NULL AS ok`);
  const rows = exists.rows[0]?.ok
    ? (await client.query<{ hash: string; created_at: string }>(`SELECT hash, created_at FROM public.__drizzle_migrations ORDER BY created_at`)).rows
    : [];
  const ours = new Set(migrations.map((m) => m.hash));
  const last = rows.length ? Number(rows[rows.length - 1].created_at) : null;
  const pending = migrations.filter((m) => last === null || last < m.folderMillis).length;
  const base = { applied: rows.length, pending, known: migrations.length, lastAppliedAt: last ? new Date(last) : null };
  if (rows.length === 0) return { kind: "empty", ...base };
  if (rows.some((r) => !ours.has(r.hash))) return { kind: "rewritten", ...base, pending: migrations.length };
  return { kind: pending ? "behind" : "current", ...base };
}

/** Applies the pending migrations in one transaction; returns how many ran. */
export async function applyMigrations(pool: Pool, migrations: Migration[]): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query(JOURNAL);
    const { rows } = await client.query<{ created_at: string }>(`SELECT created_at FROM public.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`);
    const last = rows[0] ? Number(rows[0].created_at) : null;
    const pending = migrations.filter((m) => last === null || last < m.folderMillis);
    if (pending.length === 0) return 0;
    await client.query("BEGIN");
    try {
      for (const migration of pending) {
        for (const statement of migration.sql) await client.query(statement);
        await client.query(`INSERT INTO public.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)`, [migration.hash, migration.folderMillis]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    return pending.length;
  } finally {
    client.release();
  }
}

/**
 * Whether this deployment's database may be wiped (a development deployment whose migration history was squashed):
 * only when DATABASE_ALLOW_RESET=true, and never with NODE_ENV=production and APP_ENV=production, whatever the
 * flag says.
 */
export function databaseResetAllowed(env: Record<string, string | undefined> = process.env): boolean {
  const asked = env.DATABASE_ALLOW_RESET === "true";
  const production = env.NODE_ENV === "production" && (env.NEXT_PUBLIC_APP_ENV ?? "production") === "production";
  return asked && !production;
}

/**
 * Drops every table, sequence and enum of the `public` schema, in one transaction — the schema itself stays (dropping
 * and recreating it needs a privilege managed dev databases refuse). Callers check databaseResetAllowed first.
 */
export async function dropPublicObjects(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
      END LOOP;
      FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' LOOP
        EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.sequence_name);
      END LOOP;
      FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
        EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
      END LOOP;
    END $$`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
