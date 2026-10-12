import fs from "node:fs";
import path from "node:path";

/**
 * Loads the repository's root `.env` (one file for the whole monorepo) into process.env, without
 * overriding variables already set — CI and production set real environment variables and ship no
 * file, so this is a no-op there.
 */
export function loadRootEnv(start: string = process.cwd()): void {
  let dir = path.resolve(start);
  for (let i = 0; i < 6; i++) {
    const file = path.join(dir, ".env");
    if (fs.existsSync(file) && fs.existsSync(path.join(dir, "package.json"))) {
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        if (!m || line.trimStart().startsWith("#")) continue;
        const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
        if (process.env[m[1]] === undefined && value !== "") process.env[m[1]] = value;
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
