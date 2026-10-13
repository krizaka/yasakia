#!/usr/bin/env node
/**
 * `npm run test:e2e` — the feature scenarios over HTTP, on a real PostgreSQL, from zero:
 *   1. a database of its own, `yazakia_e2e`, dropped and rebuilt (migrations + seed) — never the shared yazakia_db;
 *   2. the API (`next dev`) on :3100 with the end-to-end settings: e-mails written to a folder (the scenarios read the
 *      codes there), photos in a temporary folder, an operator token and allow-list, a purge every second;
 *   3. e2e/scenarios.mjs against it, then the server stops.
 * With APP_URL set (a server you started yourself, like CI's), only step 3 runs — with the same settings expected.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import pg from "pg";

import { c, databaseUrl, fail, isLocalDatabase, ok, ROOT, run, step } from "../scripts/lib.mjs";

export const E2E_ENV = {
  MAIL_DELIVERY: "file",
  OPERATOR_API_TOKEN: "e2e-only-operator-token-0123456789abcdef0123",
  OPERATOR_ALLOWED_IPS: "203.0.113.7",
  APP_ACCOUNT_PURGE_INTERVAL_SECONDS: "1",
  MEDIA_STORAGE_PROVIDER: "local",
  REALTIME_BUS: "postgres",
  ABUSE_RATE_LIMIT_STORE: "postgres",
};

if (process.env.APP_URL) {
  await import("./scenarios.mjs");
} else {
  if (process.env.NODE_ENV === "production") fail("Refusing to run the scenarios with NODE_ENV=production");
  const base = new URL(databaseUrl());
  if (!isLocalDatabase(base.toString())) fail(`DATABASE_URL is not local (${base.hostname}): the scenarios only run on a local database`);
  const e2eUrl = new URL(base);
  e2eUrl.pathname = "/yazakia_e2e";

  step("Database yazakia_e2e (dropped and rebuilt)");
  const admin = new pg.Client({ connectionString: base.toString() });
  await admin.connect();
  await admin.query("drop database if exists yazakia_e2e with (force)");
  await admin.query("create database yazakia_e2e");
  await admin.end();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yazakia-e2e-"));
  const env = {
    ...E2E_ENV,
    DATABASE_URL: e2eUrl.toString(),
    DATABASE_DIRECT_URL: "",
    MAIL_OUTBOX_DIR: path.join(tmp, "outbox"),
    MEDIA_STORAGE_LOCAL_DIR: path.join(tmp, "storage"),
  };
  run("npm", ["run", "db:migrate", "--silent"], { env });
  run("npm", ["run", "db:seed", "--silent"], { env });
  ok("migrated and seeded");

  step("API on :3100 (next dev, its own build folder)");
  const port = 3100;
  const server = spawn("npx", ["next", "dev", "--port", String(port)], {
    cwd: path.join(ROOT, "apps/web"),
    env: { ...process.env, ...env, NEXT_DIST_DIR: ".next-e2e", NEXT_PUBLIC_APP_URL: `http://localhost:${port}`, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = fs.createWriteStream(path.join(tmp, "web.log"));
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  const stop = () => {
    if (!server.killed) server.kill("SIGTERM");
  };
  process.on("exit", stop);
  const until = Date.now() + 120_000;
  let up = false;
  while (Date.now() < until && !up) {
    try {
      up = (await fetch(`http://localhost:${port}/api/healthz`)).ok;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!up) {
    stop();
    fail(`the API did not start — ${path.join(tmp, "web.log")}`);
  }
  ok(`ready (log: ${path.join(tmp, "web.log")})`);

  step("Scenarios");
  Object.assign(process.env, env, { APP_URL: `http://localhost:${port}` });
  try {
    await import("./scenarios.mjs");
  } finally {
    stop();
  }
  if (process.exitCode) console.log(c.dim(`server log: ${path.join(tmp, "web.log")}`));
}
