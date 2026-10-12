/**
 * Applies the SQL migrations in packages/db/drizzle (0000 creates the extensions vector, cube and earthdistance) and
 * exits. Runs `npm run db:migrate` locally, and — bundled into the production image as /app/migrate.cjs (see
 * deploy/docker/Dockerfile) — as the DigitalOcean PRE_DEPLOY job, so a release never starts against an older schema.
 *
 * It connects through DATABASE_DIRECT_URL when set (a transaction pooler cannot run DDL in one transaction across the
 * statements), else DATABASE_URL, with one connection named `yazakia-migrate`.
 */
import path from "node:path";

import { Pool } from "pg";

import { CONNECTION_NAMES, connectionConfig, directDatabaseUrl } from "./connection";
import { loadRootEnv } from "./load-env";
import { applyMigrations, databaseResetAllowed, dropPublicObjects, historyState, loadMigrations } from "./migrations";

async function main(): Promise<void> {
  loadRootEnv(__dirname);
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? (path.basename(__dirname) === "src" ? path.resolve(__dirname, "../drizzle") : path.resolve(__dirname, "drizzle"));
  const pool = new Pool({ ...connectionConfig(directDatabaseUrl(), CONNECTION_NAMES.migrate), max: 1 });
  try {
    const migrations = loadMigrations(migrationsFolder);
    const state = await historyState(pool, migrations);
    if (state.kind === "rewritten") {
      // The migration history was squashed into a new baseline: this database applied migrations we no longer ship.
      if (!databaseResetAllowed()) {
        throw new Error(
          "This database's migration history was rewritten (new baseline). It cannot migrate forward. On a development " +
            "deployment set YAZAKIA_ALLOW_DATABASE_RESET=true to rebuild it; production data is never dropped.",
        );
      }
      console.warn(`Migration history rewritten (${state.applied} applied, not all shipped by this release): rebuilding the database.`);
      await dropPublicObjects(pool);
    }
    const applied = await applyMigrations(pool, migrations);
    console.log(`Migrations: ${applied} applied from ${migrationsFolder}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
