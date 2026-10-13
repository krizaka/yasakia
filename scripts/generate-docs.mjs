#!/usr/bin/env node
/**
 * YAZAKIA — code-driven documentation.
 *
 * Reads the Drizzle schema and the Next.js API route tree and writes:
 *   - docs/API_CONTRACTS.md                        every endpoint, its access rule and its summary
 *   - docs/DATABASE.md                             every table, column, index, foreign key, check and enum
 *   - docs/_generated/yazakia-architecture.json    repositories, modules, services, tables, endpoints, enums (krizaka.com)
 * and, when this repository is cloned inside krizaka-com (products/yazakia), syncs them to the site:
 *   - app/data/yazakia-architecture.json
 *   - yazakia-content/docs/*.md                    (published through the site's manifest)
 *
 * Deterministic (no timestamps), so `--check` can fail a build when the docs are stale.
 *
 *   node scripts/generate-docs.mjs                  generate (+ sync when inside krizaka-com)
 *   node scripts/generate-docs.mjs --site <dir>     sync to that krizaka-com checkout instead (a worktree)
 *   node scripts/generate-docs.mjs --check          exit 1 when a generated file is out of date
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDatabaseMarkdown, readSchema } from "./database-doc.mjs";
import { tsImport } from "tsx/esm/api";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteArg = process.argv.indexOf("--site");
const SITE = siteArg > 0 ? path.resolve(process.argv[siteArg + 1]) : path.resolve(ROOT, "../..");
const CHECK = process.argv.includes("--check");

// Text for Markdown that is also compiled as MDX on krizaka.com: angle brackets and braces would be read as JSX.
const mdText = (s) => s.replace(/[<>{}]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "{": "&#123;", "}": "&#125;" })[c]);
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const walk = (dir, pred) =>
  !fs.existsSync(dir)
    ? []
    : fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p, pred) : pred(p) ? [p] : [];
      });

// ── API endpoints (apps/web/app/api/**/route.ts) ─────────────────────────────────────────────────
const apiDir = path.join(ROOT, "apps/web/app/api");
/** The access rule, read from what the handler calls. */
function accessOf(src) {
  if (/requireAdmin\(/.test(src)) return "operator · service token + IP allow-list";
  if (/requireUser\(/.test(src)) return "bearer · account";
  if (/receiveUpload\(/.test(src)) return "signed upload URL (one photo, 300 s)";
  if (/verifyLocalMediaToken\(/.test(src)) return "signed media URL (300 s, development storage only)";
  return "public";
}
function summaryOf(src, method) {
  const at = src.search(new RegExp(`export (async )?function ${method}\\b`));
  const before = src.slice(0, at);
  const open = before.lastIndexOf("/**");
  const doc = open < 0 ? null : before.slice(open).match(/^\/\*\*([\s\S]*?)\*\/\s*$/);
  if (!doc) return "";
  return doc[1]
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean)
    .join(" ")
    .split(/(?<=[a-z0-9)`]\.)\s/)[0];
}
const endpoints = walk(apiDir, (p) => /route\.(ts|js)$/.test(p))
  .map((file) => {
    const src = read(file);
    const route = "/api/" + path.relative(apiDir, path.dirname(file)).split(path.sep).join("/").replace(/\[\.\.\.(\w+)\]/g, "{$1…}").replace(/\[(\w+)\]/g, "{$1}");
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => new RegExp(`export (async )?function ${m}\\b`).test(src));
    const starts = methods.map((m) => ({ m, at: src.search(new RegExp(`export (async )?function ${m}\\b`)) }));
    return starts.map(({ m, at }) => {
      const next = starts.map((s) => s.at).filter((x) => x > at).sort((x, y) => x - y)[0] ?? src.length;
      return { method: m, path: route, access: accessOf(src.slice(at, next)), summary: summaryOf(src, m) };
    });
  })
  .flat()
  .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

// ── Schema (Drizzle objects) ──────────────────────────────────────────────────────────────────────
const schema = readSchema(ROOT);
const workspace = JSON.parse(read(path.join(ROOT, "yazakia.workspace.json")));

const model = {
  product: "yazakia",
  title: "Yazakia Architecture",
  source: "generated from code by products/yazakia/scripts/generate-docs.mjs — do not hand-edit",
  repositories: workspace.repositories.map((r) => ({
    name: r.name,
    repo: `${workspace.org}/${r.name}`,
    url: `https://github.com/${workspace.org}/${r.name}`,
    port: r.port,
    role: r.role,
  })),
  modules: [
    { id: "api", name: "API", path: "apps/web/app/api", features: ["Route handlers — the only HTTP surface", "Bearer sessions for the native app", "Rate limits per account and per IP", "Fail-closed configuration"] },
    { id: "web", name: "Legal pages", path: "apps/web/app/[locale]", features: ["Privacy, terms, account deletion", "English and French", "@krizaka/ui, both themes"] },
    { id: "data", name: "Data", path: "packages/db", features: ["PostgreSQL 16 + pgvector, cube, earthdistance", "Drizzle schema and migrations", "One named pool per process", "AES-256-GCM sealed columns"], tables: schema.tables.map((t) => t.name) },
    { id: "media", name: "Photos", path: "packages/media", features: ["Signed upload URLs (300 s)", "Metadata stripped, blurhash computed", "Bunny Optimizer URLs signed for one viewer (300 s)", "PhotoModeration"] },
    { id: "realtime", name: "Realtime", path: "apps/web/lib/realtime.ts", features: ["@krizaka/realtime — LISTEN/NOTIFY or Redis", "Typed events: batch.ready, intro.opened, intro.message", "Server-Sent Events"] },
    { id: "push", name: "Push", path: "apps/web/lib/push.ts", features: ["@krizaka/push — Expo Push → FCM / APNs"] },
  ],
  services: [
    { id: "postgres", name: "PostgreSQL 16 + pgvector", kind: "data store" },
    { id: "bunny", name: "Bunny Storage + Optimizer", kind: "media" },
    { id: "mailgun", name: "Mailgun", kind: "e-mail" },
    { id: "expo", name: "Expo Push (FCM, APNs)", kind: "push" },
    { id: "orazaka", name: "Orazaka (AI — next milestone)", kind: "ai" },
  ],
  tables: schema.tables.map((t) => ({ name: t.name, columns: t.columns.length, references: [...new Set(t.foreignKeys.map((fk) => fk.table))] })),
  apiEndpoints: endpoints,
  // Every PostgreSQL enum: a ```states``` block of the docs naming one (`enum: agent_state`) is checked against it.
  enums: Object.fromEntries(schema.enums.map((e) => [e.name, e.values])),
};

const apiMarkdown = `---
title: Yazakia API Reference
description: Every HTTP endpoint of the Yazakia API, with the access rule that guards it — extracted from the code.
---

# Yazakia API Reference

> Generated from code by \`scripts/generate-docs.mjs\` — do not hand-edit. The summary is the first sentence of each
> handler's JSDoc; the access rule is read from what the handler calls.

Base: \`https://<host>/api\`. Every answer is JSON with \`success\`; a refusal carries a stable \`code\` (the app words it).
Sessions: \`Authorization: Bearer <token>\` from \`POST /api/auth/verify\` (\`client: "native"\`).

## Endpoints (${endpoints.length})

| Method | Path | Access | Summary |
| :--- | :--- | :--- | :--- |
${endpoints.map((e) => `| \`${e.method}\` | \`${e.path}\` | ${e.access} | ${mdText(e.summary) || "—"} |`).join("\n")}

## Database tables (${schema.tables.length})

See the Database Reference: ${schema.tables.map((t) => `\`${t.name}\``).join(" · ")}.
`;

// ── Configuration (docs/DEPLOYMENT.md) — from apps/web/lib/env-vars.ts, grouped by bounded context ─────────────
const { ENV_VARS, ENV_CONTEXTS } = await tsImport(path.join(ROOT, "apps/web/lib/env-vars.ts"), import.meta.url);
// Inline code stays as written; elsewhere angle brackets and braces are escaped for MDX, pipes for the table.
const mdCell = (s) => s.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : mdText(part))).join("").replace(/[\\|]/g, (c) => `\\${c}`);
const NEED = { required: "✓", recommended: "recommended", optional: "—" };
const configMarkdown = [
  "## Configuration",
  "",
  "> Generated from `apps/web/lib/env-vars.ts` (`ENV_VARS`) by `scripts/generate-docs.mjs` — do not hand-edit this section.",
  "",
  "Every variable is named `<CONTEXT>_<THING>` after the part of Yazakia it configures — never after the product or a",
  "vendor: a vendor is a value (`MEDIA_STORAGE_PROVIDER=bunny`, `MAIL_PROVIDER=mailgun`). **Production** ✓ = the server",
  "refuses to start without it (`assertProductionConfig`, which also checks every value set against its schema);",
  "**Secret** = a `SECRET` on App Platform. Every variable is also in `.env.example`.",
  "",
  ...Object.entries(ENV_CONTEXTS).flatMap(([context, label]) => {
    const vars = ENV_VARS.filter((e) => e.context === context);
    if (!vars.length) return [];
    return [
      `### ${label.split(" — ")[0]} — \`${context}_\``,
      "",
      "| Variable | Production | Secret | Default | What it does |",
      "| :--- | :---: | :---: | :--- | :--- |",
      ...vars.map((e) => `| \`${e.name}\`${e.build ? " *(build)*" : ""} | ${NEED[e.need]} | ${e.secret ? "✓" : ""} | ${e.default ? mdCell(`\`${e.default}\``) : ""} | ${mdCell(e.doc)} |`),
      "",
    ];
  }),
].join("\n");
const deploymentPath = path.join(ROOT, "docs/DEPLOYMENT.md");
const configBlock = /## Configuration\n[\s\S]*?\n(?=## Database connections)/;
if (!configBlock.test(read(deploymentPath))) throw new Error('docs/DEPLOYMENT.md has no "## Configuration" section before "## Database connections"');
const deploymentMarkdown = read(deploymentPath).replace(configBlock, () => configMarkdown + "\n");

const outputs = {
  [deploymentPath]: deploymentMarkdown,
  [path.join(ROOT, "docs/_generated/yazakia-architecture.json")]: JSON.stringify(model, null, 2) + "\n",
  [path.join(ROOT, "docs/API_CONTRACTS.md")]: apiMarkdown,
  [path.join(ROOT, "docs/DATABASE.md")]: buildDatabaseMarkdown(ROOT, schema),
};

if (CHECK) {
  const stale = Object.entries(outputs).filter(([p, content]) => read(p) !== content);
  if (stale.length) {
    console.error("✗ docs are stale — run `npm run docs:generate`:");
    for (const [p] of stale) console.error(`  - ${path.relative(ROOT, p)}`);
    process.exit(1);
  }
  console.log(`✓ docs up to date (${endpoints.length} endpoints, ${schema.tables.length} tables).`);
  process.exit(0);
}

for (const [p, content] of Object.entries(outputs)) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
console.log(`✓ docs generated (${endpoints.length} endpoints, ${schema.tables.length} tables).`);

// ── Sync into krizaka-com when cloned at products/yazakia ──────────────────────────────────────────
if (fs.existsSync(path.join(SITE, "app/data")) && fs.existsSync(path.join(SITE, "lib/docs-manifest.ts"))) {
  fs.writeFileSync(path.join(SITE, "app/data/yazakia-architecture.json"), outputs[path.join(ROOT, "docs/_generated/yazakia-architecture.json")]);
  const dest = path.join(SITE, "yazakia-content/docs");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const docs = fs.readdirSync(path.join(ROOT, "docs")).filter((n) => n.endsWith(".md"));
  for (const name of docs) fs.copyFileSync(path.join(ROOT, "docs", name), path.join(dest, name));
  console.log(`✓ synced ${docs.length} docs + architecture to krizaka-com (${path.relative(process.cwd(), SITE) || "."})`);
}
