/**
 * Prints the Drizzle schema as JSON (tables, columns, indexes, foreign keys, checks, enums) for
 * scripts/generate-docs.mjs, which turns it into docs/DATABASE.md. Reading the schema objects themselves keeps the
 * database documentation exact: it cannot drift from the code.
 */
import { is, SQL } from "drizzle-orm";
import { getTableConfig, type PgEnum, PgTable } from "drizzle-orm/pg-core";

import * as schema from "../src/schema";

/** An SQL fragment as text (an index expression, a check) — column references by name. */
function sqlText(fragment: SQL): string {
  return fragment.queryChunks
    .map((chunk) => {
      if (is(chunk, SQL)) return sqlText(chunk);
      const named = chunk as { name?: string; value?: string[] };
      if (Array.isArray(named.value)) return named.value.join("");
      if (typeof named.name === "string") return named.name;
      return "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

const tables = [];
const enums: { name: string; values: string[] }[] = [];

for (const value of Object.values(schema)) {
  if (is(value, PgTable)) {
    const t = getTableConfig(value);
    tables.push({
      name: t.name,
      columns: t.columns.map((col) => ({
        name: col.name,
        type: col.getSQLType(),
        notNull: col.notNull,
        primary: col.primary || t.primaryKeys.some((pk) => pk.columns.some((c) => c.name === col.name)),
        unique: col.isUnique,
        default: !col.hasDefault ? null : is(col.default, SQL) ? sqlText(col.default) : col.defaultFn ? "generated" : JSON.stringify(col.default),
      })),
      foreignKeys: t.foreignKeys.map((fk) => {
        const ref = fk.reference();
        return {
          columns: ref.columns.map((c) => c.name),
          table: getTableConfig(ref.foreignTable).name,
          foreignColumns: ref.foreignColumns.map((c) => c.name),
          onDelete: fk.onDelete ?? "no action",
        };
      }),
      indexes: t.indexes.map((i) => ({
        name: i.config.name,
        unique: i.config.unique,
        method: i.config.method ?? "btree",
        columns: i.config.columns.map((c) => (is(c, SQL) ? sqlText(c) : "name" in c ? (c as { name: string }).name : "expr")),
        where: i.config.where ? sqlText(i.config.where) : null,
      })),
      checks: t.checks.map((c) => ({ name: c.name, value: sqlText(c.value) })),
    });
  } else if (typeof value === "function" && (value as unknown as PgEnum<[string, ...string[]]>).enumName) {
    const e = value as unknown as PgEnum<[string, ...string[]]>;
    enums.push({ name: e.enumName, values: [...e.enumValues] });
  }
}

tables.sort((a, b) => a.name.localeCompare(b.name));
enums.sort((a, b) => a.name.localeCompare(b.name));
process.stdout.write(JSON.stringify({ tables, enums }));
