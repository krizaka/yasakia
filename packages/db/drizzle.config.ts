import { defineConfig } from "drizzle-kit";

import { loadRootEnv } from "./src/load-env";

loadRootEnv(__dirname);

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Schema changes go through a direct connection (never a transaction pooler), like the migrator.
    url:
      process.env.DATABASE_DIRECT_URL ||
      process.env.DATABASE_URL ||
      "postgresql://yasakia_user:yasakia_secret@localhost:5435/yasakia_db?sslmode=disable",
  },
  // The migrations log lives in `public`: a managed dev database lets its user create objects there only
  // (CREATE SCHEMA is denied). Same place in every environment (see src/migrations.ts).
  migrations: { schema: "public" },
  // pgvector, cube and earthdistance are created by migration 0000, not managed by drizzle-kit.
  extensionsFilters: ["postgis"],
  verbose: true,
  strict: true,
});
