/**
 * docs/DATABASE.md — the database reference, built from the Drizzle schema objects themselves
 * (packages/db/scripts/schema-json.ts), so it cannot drift from the code. The design notes below the header are the
 * decisions the schema stands on (they live here, with the generator, because DATABASE.md is generated).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const code = (s) => "`" + s + "`";
const cell = (s) => String(s).replace(/\|/g, "\\|");

/** The schema as data (tables, columns, foreign keys, indexes, checks, enums), read from the Drizzle objects. */
export function readSchema(root) {
  return JSON.parse(
    execFileSync(path.join(root, "node_modules/.bin/tsx"), [path.join(root, "packages/db/scripts/schema-json.ts")], {
      cwd: path.join(root, "packages/db"),
      encoding: "utf8",
    }),
  );
}

const DESIGN_NOTES = [
  "## Design notes",
  "",
  "- **Extensions first.** Migration `0000_extensions` creates `vector` (pgvector), `cube` and `earthdistance` before any table; on a managed PostgreSQL it runs as the database owner. The development image is `pgvector/pgvector:pg16` (cube and earthdistance ship with PostgreSQL's contrib).",
  "- **Vectors: HNSW, cosine.** `facet_embeddings.vector` is indexed with HNSW (`vector_cosine_ops`), not IVFFlat. IVFFlat partitions the vectors into lists computed when the index is built: it needs representative data first and its recall degrades as rows arrive, which is exactly Yasakia's life — a pool that starts empty and grows every day. HNSW needs no training, keeps its recall as rows are added, and answers in milliseconds at the pool sizes of a city (thousands to hundreds of thousands of vectors). What it costs: a slower build and more memory per row, both negligible at that scale. The dimension is fixed by the migration (768, `EMBEDDING_DIMENSIONS`); `facet_embeddings.model` records the model of every vector, and changing models is a migration plus a re-index (PY3).",
  "- **Distance: earthdistance over a GiST index.** `profiles_earth_idx` indexes `ll_to_earth(lat, lng)`; a radius query is `earth_box(ll_to_earth(:lat, :lng), :metres) @> ll_to_earth(lat, lng)` (index) refined by `earth_distance(…) <= :metres`. PostGIS is not needed for a radius filter over one city's profiles — it would be adopted only for a query this cannot express (documented then).",
  "- **No exact position.** `lat` / `lng` are rounded to ~1 km by the API **before** they are written (`apps/web/lib/geo.ts`); `geo_precision_m` says how coarse. A check keeps both coordinates set or both empty.",
  "- **Sealed columns.** `facets.value_sealed`, `reports.details_sealed` and `account_exports.payload_sealed` hold AES-256-GCM values (`enc:v1:<key id>:…`, `packages/db/src/crypto.ts`) bound to their row and column; checks keep a sensitive facet out of the clear `value` column.",
  "- **Deletion is a cascade.** Every table that belongs to a person references `accounts` with `ON DELETE CASCADE`; reports and AI call logs outlive the account with the reference set to null; `account_deletions` keeps only an id, a date and the media keys until the purge empties them.",
  "- **One current batch.** A partial unique index (`batches_one_current_idx`) allows at most one batch per account that is OPEN or waiting for its debrief; an intro is stored once per pair (`account_a < account_b`, unique).",
  "",
];

export function buildDatabaseMarkdown(root, schema = readSchema(root)) {
  const { tables, enums } = schema;
  const migrations = fs.readdirSync(path.join(root, "packages/db/drizzle")).filter((f) => f.endsWith(".sql")).sort();

  const refs = (t) => t.foreignKeys.map((fk) => `${code(fk.table)} (${fk.columns.map(code).join(", ")})`);
  const referencedBy = (name) => [...new Set(tables.filter((o) => o.foreignKeys.some((fk) => fk.table === name)).map((o) => code(o.name)))];
  const relations = tables
    .filter((t) => t.foreignKeys.length || referencedBy(t.name).length)
    .map((t) => `| ${code(t.name)} | ${refs(t).join(" · ") || "—"} | ${referencedBy(t.name).join(" · ") || "—"} |`);

  const tableSection = (t) => {
    const rows = t.columns.map((col) => {
      const fk = t.foreignKeys.find((f) => f.columns.includes(col.name));
      const notes = [col.primary ? "primary key" : "", col.unique ? "unique" : "", fk ? `→ ${code(`${fk.table}.${fk.foreignColumns[0]}`)} (on delete ${fk.onDelete})` : ""].filter(Boolean).join(" · ");
      const def = col.default === null ? "" : code(cell(col.default));
      return `| ${code(col.name)} | ${cell(col.type)} | ${col.notNull ? "no" : "yes"} | ${def} | ${notes} |`;
    });
    const indexes = t.indexes.length
      ? `\n**Indexes:** ${t.indexes
          .map((i) => `${code(i.name)} (${i.unique ? "unique, " : ""}${i.method !== "btree" ? `${i.method}, ` : ""}${cell(i.columns.join(", "))}${i.where ? `, where ${cell(i.where)}` : ""})`)
          .join(" · ")}\n`
      : "";
    const checks = t.checks.length ? `\n**Checks:** ${t.checks.map((c) => `${code(c.name)} (${code(cell(c.value))})`).join(" · ")}\n` : "";
    return [`### ${code(t.name)}`, "", "| Column | Type | Null | Default | Notes |", "| :--- | :--- | :--- | :--- | :--- |", ...rows, indexes + checks].join("\n");
  };

  return [
    "---",
    "title: Database Reference",
    "description: Every table, column, index, foreign key, check and enum of the Yasakia PostgreSQL schema — generated from the Drizzle schema.",
    "---",
    "",
    "# Database Reference",
    "",
    `> Generated from ${code("packages/db/src/schema")} by ${code("scripts/generate-docs.mjs")} — do not hand-edit.`,
    `> To change the schema: edit it, ${code("npm run db:generate -- --name <what_changed>")}, read the SQL, ${code("npm run db:migrate")} — see the Development guide.`,
    "",
    `PostgreSQL 16 + pgvector · ${tables.length} tables · ${enums.length} enums · ${migrations.length} migrations (${code("packages/db/drizzle")}).`,
    "",
    ...DESIGN_NOTES,
    "## Relationships",
    "",
    "Every foreign key, read from the schema: what each table points to (through which columns) and which tables point to it.",
    "",
    "| Table | References (columns) | Referenced by |",
    "| :--- | :--- | :--- |",
    ...relations,
    "",
    "## Tables",
    "",
    ...tables.map(tableSection),
    "## Enums",
    "",
    "| Enum | Values |",
    "| :--- | :--- |",
    ...enums.map((e) => `| ${code(e.name)} | ${e.values.map(code).join(", ")} |`),
    "",
    "## Migrations",
    "",
    ...migrations.map((m) => `- ${code(m)}`),
    "",
  ].join("\n");
}
