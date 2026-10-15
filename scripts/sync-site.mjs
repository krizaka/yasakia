#!/usr/bin/env node
// The public landing (apps/site, a static export) is served by the web service: one deployment, one origin.
//   npm run build:site && node scripts/sync-site.mjs
// copies apps/site/out into apps/web/public so Next serves it as plain files:
//   out/<page>/index.html, the RSC payloads (`__next*.txt`), robots.txt, sitemap.xml, llms.txt, og.png → public/ (same paths)
//   out/_next                                                                                        → public/site-assets/_next
// (the export is built with assetPrefix "/site-assets", so its chunks never meet the web app's own /_next). Pages are mapped to
// their files by the rewrites of apps/web/next.config.mjs (LANDING_PAGES). public/ is generated and git-ignored.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = join(root, "apps/site/out");
export const PUBLIC = join(root, "apps/web/public");
const SKIP = new Set(["_next", "404", "404.html", "_not-found"]);

export function syncSite(out = OUT, target = PUBLIC) {
  if (!existsSync(join(out, "index.html"))) throw new Error(`${out}/index.html is missing: run \`npm run build:site\` first`);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(out)) if (!SKIP.has(name)) cpSync(join(out, name), join(target, name), { recursive: true });
  mkdirSync(join(target, "site-assets"), { recursive: true });
  cpSync(join(out, "_next"), join(target, "site-assets/_next"), { recursive: true });
  return readdirSync(target);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(`landing synced into apps/web/public: ${syncSite().join(", ")}`);
