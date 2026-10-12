/** Shared helpers of the Yazakia developer scripts (no dependencies: Node 20+ only). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const COMPOSE = ["compose", "-f", path.join(ROOT, "deploy/docker/docker-compose.dev.yml")];
/** The dev container (deploy/docker/docker-compose.dev.yml) — port 5435, so it lives next to Orochia's and Orazaka's. */
export const CONTAINER = "yazakia-postgres-dev";
export const DEV_DATABASE_URL = "postgresql://yazakia_user:yazakia_secret@localhost:5435/yazakia_db?sslmode=disable";

const tty = process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = { bold: paint(1), dim: paint(2), green: paint(32), red: paint(31), yellow: paint(33), cyan: paint(36) };
export const step = (s) => console.log(`\n${c.cyan("▸")} ${c.bold(s)}`);
export const ok = (s) => console.log(`  ${c.green("✓")} ${s}`);
export const warn = (s) => console.log(`  ${c.yellow("!")} ${s}`);
export const fail = (s) => {
  console.error(`  ${c.red("✗")} ${s}`);
  process.exit(1);
};

/** Runs a command, streaming its output; exits on failure unless `allowFail`. */
export function run(cmd, args, { allowFail = false, quiet = false, env } = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: quiet ? "pipe" : "inherit", env: { ...process.env, ...env }, encoding: "utf8" });
  if (r.status !== 0 && !allowFail) fail(`${cmd} ${args.join(" ")} failed`);
  return r;
}

/** Reads the root .env into a plain object (without touching process.env). */
export function readEnv(file = path.join(ROOT, ".env")) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith("#")) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

export function databaseUrl() {
  return process.env.DATABASE_URL || readEnv().DATABASE_URL || DEV_DATABASE_URL;
}

/** True when the database URL points at this machine (the only place destructive scripts run). */
export function isLocalDatabase(url = databaseUrl()) {
  try {
    const host = new URL(url).hostname;
    return ["localhost", "127.0.0.1", "::1", "postgres", "db"].includes(host);
  } catch {
    return false;
  }
}

export function waitForPort(port, host = "127.0.0.1", timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const s = net.connect(port, host);
      s.once("connect", () => {
        s.end();
        resolve();
      });
      s.once("error", () => {
        s.destroy();
        if (Date.now() > until) reject(new Error(`port ${port} not reachable`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

/** Waits until PostgreSQL in the dev container accepts queries (not just TCP). */
export async function waitForPostgres(timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const r = run("docker", ["exec", CONTAINER, "pg_isready", "-U", "yazakia_user", "-d", "yazakia_db"], { allowFail: true, quiet: true });
    if (r.status === 0) return;
    await new Promise((r2) => setTimeout(r2, 700));
  }
  fail(`PostgreSQL did not become ready in time (docker logs ${CONTAINER})`);
}

/** The shared development database: every session and worktree works on its own, never on this one. */
export const SHARED_DATABASE = "yazakia_db";

/**
 * The database of a branch: `yazakia_<branch>` (lower-case, [a-z0-9_], at most 63 characters) — `main` (or no branch)
 * keeps the shared one. A session or a worktree on `feat/photos` works on `yazakia_feat_photos`.
 */
export function databaseForBranch(branch) {
  if (!branch || branch === "main" || branch === "HEAD") return SHARED_DATABASE;
  const slug = branch.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `yazakia_${slug}`.slice(0, 63);
}

/**
 * Why a destructive command (reset, restore) refuses a database, or null when it may go on: never the shared
 * database, never a demo database (`*_demo` — only `demo:seed` writes those).
 */
export function destructionRefusal(name) {
  if (name === SHARED_DATABASE) return `${name} is the shared database — work on your branch's (npm run setup on a branch creates it)`;
  if (/_demo$/.test(name)) return `${name} is a demo database — only demo:seed rebuilds it`;
  return null;
}

/** The current git branch, or null. */
export function currentBranch() {
  const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}
