#!/usr/bin/env node
/**
 * One-command local setup: `npm run setup`.
 *   1. checks Node ≥ 20 and Docker
 *   2. creates .env from .env.example with a fresh AUTH_SESSION_SECRET and DATABASE_ENCRYPTION_KEY (an existing .env is kept,
 *      and a missing secret is added to it)
 *   3. starts PostgreSQL 16 + pgvector (deploy/docker/docker-compose.dev.yml, port 5435) and waits for it
 *      — on a branch (a session, a worktree), DATABASE_URL names the branch's own database (`yazakia_<branch>`), never
 *      the shared yazakia_db
 *   4. installs dependencies if needed, applies migrations, seeds the development data
 * Safe to run again at any time: every step is idempotent.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { c, COMPOSE, CONTAINER, currentBranch, databaseForBranch, databaseUrl, fail, isLocalDatabase, ok, readEnv, ROOT, run, SHARED_DATABASE, step, waitForPostgres } from "./lib.mjs";

step("Prerequisites");
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) fail(`Node ${process.versions.node} — Yazakia needs Node 20 or later`);
ok(`Node ${process.versions.node}`);
if (run("docker", ["info"], { allowFail: true, quiet: true }).status !== 0) fail("Docker is not running — start Docker Desktop (or the daemon) and retry");
ok("Docker is running");

step("Environment (.env)");
const envFile = path.join(ROOT, ".env");
/** The secrets setup generates: never a shared placeholder, a fresh value per machine. */
const SECRETS = {
  AUTH_SESSION_SECRET: () => crypto.randomBytes(32).toString("hex"),
  DATABASE_ENCRYPTION_KEY: () => crypto.randomBytes(32).toString("base64"),
};
if (!fs.existsSync(envFile)) {
  let text = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  for (const [name, make] of Object.entries(SECRETS)) text = text.replace(new RegExp(`^${name}=\\s*$`, "m"), `${name}=${make()}`);
  const own = databaseForBranch(currentBranch());
  if (own !== SHARED_DATABASE) text = text.replace(/^(DATABASE_URL=.*\/)yazakia_db(\?.*)?$/m, `$1${own}$2`);
  fs.writeFileSync(envFile, text);
  if (own !== SHARED_DATABASE) ok(`this branch works on its own database: ${own}`);
  ok(`.env created from .env.example with a generated ${Object.keys(SECRETS).join(" and ")}`);
} else {
  const current = readEnv(envFile);
  const missing = Object.keys(SECRETS).filter((name) => !current[name]);
  if (missing.length === 0) ok(".env already exists — kept as is");
  else {
    let text = fs.readFileSync(envFile, "utf8");
    for (const name of missing) {
      const line = `${name}=${SECRETS[name]()}`;
      text = new RegExp(`^${name}=\\s*$`, "m").test(text) ? text.replace(new RegExp(`^${name}=\\s*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`;
    }
    fs.writeFileSync(envFile, text);
    ok(`.env kept; generated the missing ${missing.join(", ")}`);
  }
}
if (!isLocalDatabase()) fail(`DATABASE_URL points at ${new URL(databaseUrl()).hostname}: setup only provisions a local database`);

step("PostgreSQL 16 + pgvector");
run("docker", [...COMPOSE, "up", "-d", "--wait"], { allowFail: true }).status === 0 || run("docker", [...COMPOSE, "up", "-d"]);
await waitForPostgres();
ok("PostgreSQL is ready on localhost:5435");
{
  const name = decodeURIComponent(new URL(process.env.DATABASE_URL || readEnv().DATABASE_URL || databaseUrl()).pathname.slice(1));
  if (/^[a-z0-9_]{1,63}$/.test(name) && name !== SHARED_DATABASE) {
    const exists = run("docker", ["exec", CONTAINER, "psql", "-U", "yazakia_user", "-d", SHARED_DATABASE, "-Atc", `select 1 from pg_database where datname = '${name}'`], { quiet: true }).stdout.trim();
    if (!exists) run("docker", ["exec", CONTAINER, "createdb", "-U", "yazakia_user", name], { quiet: true });
    ok(`database ${name} ready`);
  }
}

step("Dependencies");
if (fs.existsSync(path.join(ROOT, "node_modules"))) ok("node_modules present (run `npm install` after pulling)");
else run("npm", ["install", "--no-audit", "--no-fund"]);

step("Database schema");
run("npm", ["run", "db:migrate", "--silent"]);
ok("Migrations applied (extensions vector, cube, earthdistance + the schema)");

step("Development data");
run("npm", ["run", "db:seed", "--silent"]);

console.log(`\n${c.green(c.bold("Ready."))} Start the API with ${c.bold("npm run dev")} → http://localhost:3000/api/healthz`);
console.log(c.dim("Database: npm run db:status · db:studio · db:psql · db:reset — see docs/DEVELOPMENT.md"));
