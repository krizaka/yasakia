#!/usr/bin/env node
/**
 * Database lifecycle for development — `npm run db:<command>`:
 *   status   migrations applied vs. files, row counts of the main tables
 * reset and restore refuse the shared yazakia_db and every *_demo database, and dump the target to backups/ first.
 *   reset    drops the local schema, re-applies every migration, re-seeds (asks for confirmation;
 *            `--yes` skips it). Refuses any non-local DATABASE_URL and NODE_ENV=production.
 *   psql     opens psql in the dev container
 *   dump     writes a SQL dump of the local database to ./backups/
 *   restore  restores a dump: `npm run db:restore -- backups/<file>.sql`
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";

import { c, CONTAINER, databaseUrl, destructionRefusal, fail, isLocalDatabase, ok, ROOT, run, step, warn } from "./lib.mjs";

const [command, ...rest] = process.argv.slice(2);
// The database and role of DATABASE_URL — never a hard-coded name: a worktree on its own database (e.g. yazakia_e2e)
// must never reset, dump or restore the shared yazakia_db.
const target = (() => {
  const url = new URL(databaseUrl());
  const name = decodeURIComponent(url.pathname.replace(/^\//, "")) || "yazakia_db";
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(name)) fail(`Unexpected database name in DATABASE_URL: ${name}`);
  return { name, user: decodeURIComponent(url.username) || "yazakia_user" };
})();
const PSQL = ["exec", "-i", CONTAINER, "psql", "-U", target.user, "-d", target.name, "-v", "ON_ERROR_STOP=1"];
// The extensions live in `public` too (vector, cube, earthdistance): dropping the schema drops them, the migrations
// re-create them.
const DROP = "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;";

function guardLocal(action) {
  if (process.env.NODE_ENV === "production") fail(`Refusing to ${action}: NODE_ENV=production`);
  if (!isLocalDatabase()) fail(`Refusing to ${action}: DATABASE_URL is not local (${new URL(databaseUrl()).hostname})`);
  if (run("docker", ["inspect", CONTAINER], { allowFail: true, quiet: true }).status !== 0) {
    fail("The dev database container is not running — run `npm run setup` (or npm run db:up) first");
  }
}

/** Before any destruction: refuse the shared and demo databases, then dump the target to backups/ (automatic). */
function guardDestruction(action) {
  const refusal = destructionRefusal(target.name);
  if (refusal) fail(`Refusing to ${action}: ${refusal}`);
  fs.mkdirSync(path.join(ROOT, "backups"), { recursive: true });
  const file = path.join(ROOT, "backups", `yazakia-${target.name}-before-${action.split(" ")[0]}-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
  const r = run("docker", ["exec", CONTAINER, "pg_dump", "-U", target.user, "-d", target.name, "--no-owner"], { quiet: true });
  fs.writeFileSync(file, r.stdout);
  ok(`Dumped ${target.name} first: ${path.relative(ROOT, file)}`);
}

const sqlOut = (query) => run("docker", [...PSQL, "-At", "-c", query], { quiet: true }).stdout.trim();

switch (command) {
  case "status": {
    guardLocal("read the database");
    const files = fs.readdirSync(path.join(ROOT, "packages/db/drizzle")).filter((f) => f.endsWith(".sql")).sort();
    const applied = Number(sqlOut("select count(*) from public.__drizzle_migrations") || 0);
    step("Migrations");
    files.forEach((f, i) => console.log(`  ${i < applied ? c.green("✓") : c.yellow("·")} ${f}`));
    if (applied < files.length) console.log(c.yellow(`  ${files.length - applied} pending — run npm run db:migrate`));
    step("Rows");
    for (const t of ["accounts", "profiles", "profile_photos", "agent_sessions", "facets", "batches", "intros", "blocks", "reports", "account_deletions"]) {
      console.log(`  ${t.padEnd(20)} ${sqlOut(`select count(*) from ${t}`)}`);
    }
    break;
  }
  case "reset": {
    guardLocal("reset the database");
    guardDestruction("reset the database");
    if (!rest.includes("--yes")) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`${c.red(`This deletes every row of the local database ${target.name}.`)} Type "reset" to continue: `);
      rl.close();
      if (answer.trim() !== "reset") fail("Cancelled");
    }
    step(`Dropping the local schema of ${target.name}`);
    run("docker", [...PSQL, "-c", DROP], { quiet: true });
    ok("Schema dropped");
    step("Migrations");
    run("npm", ["run", "db:migrate", "--silent"]);
    step("Seed");
    run("npm", ["run", "db:seed", "--silent"]);
    ok("Local database rebuilt from the migrations and the seed");
    break;
  }
  case "psql": {
    guardLocal("open psql");
    run("docker", ["exec", "-it", CONTAINER, "psql", "-U", target.user, "-d", target.name]);
    break;
  }
  case "dump": {
    guardLocal("dump the database");
    fs.mkdirSync(path.join(ROOT, "backups"), { recursive: true });
    const file = path.join(ROOT, "backups", `yazakia-${target.name}-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
    const r = run("docker", ["exec", CONTAINER, "pg_dump", "-U", target.user, "-d", target.name, "--no-owner"], { quiet: true });
    fs.writeFileSync(file, r.stdout);
    ok(`Dump written to ${path.relative(ROOT, file)}`);
    break;
  }
  case "restore": {
    guardLocal("restore the database");
    guardDestruction("restore the database");
    const file = rest.find((a) => !a.startsWith("--"));
    if (!file || !fs.existsSync(file)) fail("Usage: npm run db:restore -- backups/<file>.sql");
    warn(`Restoring over the local database ${target.name}`);
    run("docker", [...PSQL, "-c", DROP], { quiet: true });
    const restore = spawnSync("docker", PSQL, { input: fs.readFileSync(file), stdio: ["pipe", "inherit", "inherit"] });
    if (restore.status !== 0) fail("Restore failed");
    ok(`Restored ${file}`);
    break;
  }
  default:
    console.log("Usage: npm run db:status | db:reset [-- --yes] | db:psql | db:dump | db:restore -- <file>");
    process.exit(command ? 1 : 0);
}
