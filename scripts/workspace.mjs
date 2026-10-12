#!/usr/bin/env node
/**
 * The Yazakia repositories, side by side — `npm run workspace -- <command>`:
 *   clone    clones the missing repositories next to this one (../yazakia-mobile)
 *   status   branch, ahead/behind and local changes of each repository
 *   pull     fast-forwards every clean repository
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, c, run } from "./lib.mjs";

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "yazakia.workspace.json"), "utf8"));
const dirOf = (name) => (name === "yazakia" ? ROOT : path.resolve(ROOT, "..", name));
const git = (dir, args) => run("git", ["-C", dir, ...args], { quiet: true, allowFail: true });
const command = process.argv[2] ?? "status";

for (const repo of manifest.repositories) {
  const dir = dirOf(repo.name);
  const exists = fs.existsSync(path.join(dir, ".git"));
  if (command === "clone") {
    if (exists) console.log(`  ${c.green("✓")} ${repo.name} ${c.dim(dir)}`);
    else {
      console.log(`  ${c.magenta("↓")} ${repo.name}`);
      run("git", ["clone", `https://github.com/${manifest.org}/${repo.name}.git`, dir]);
    }
  } else if (command === "status") {
    if (!exists) {
      console.log(`  ${c.yellow("·")} ${repo.name.padEnd(24)} not cloned — npm run workspace -- clone`);
      continue;
    }
    git(dir, ["fetch", "--quiet"]);
    const branch = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
    const counts = git(dir, ["rev-list", "--left-right", "--count", "HEAD...@{u}"]).stdout.trim().split(/\s+/);
    const dirty = git(dir, ["status", "--porcelain"]).stdout.trim().split("\n").filter(Boolean).length;
    console.log(
      `  ${dirty ? c.yellow("●") : c.green("✓")} ${repo.name.padEnd(24)} ${branch.padEnd(8)} ↑${counts[0] ?? 0} ↓${counts[1] ?? 0}${dirty ? `  ${dirty} changed` : ""}  ${c.dim(`:${repo.port} ${repo.role}`)}`,
    );
  } else if (command === "pull") {
    if (!exists) continue;
    const dirty = git(dir, ["status", "--porcelain"]).stdout.trim();
    if (dirty) console.log(`  ${c.yellow("!")} ${repo.name}: local changes, skipped`);
    else console.log(`  ${c.green("✓")} ${repo.name}: ${git(dir, ["pull", "--ff-only", "--quiet"]).status === 0 ? "up to date" : "could not fast-forward"}`);
  } else {
    console.log("Usage: npm run workspace -- clone | status | pull");
    process.exit(1);
  }
}
