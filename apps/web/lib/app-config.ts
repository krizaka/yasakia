import { type AppConfigRecord, type FlagValue, toPlatform, UPDATE_MODES, type UpdateMode } from "@krizaka/app-config";
import { type AppConfigStore, cachedStore } from "@krizaka/app-config/server";
import { db } from "@yasakia/db";
import { sql } from "drizzle-orm";

/**
 * The app-version contract (krizaka/.github#75, `@krizaka/app-config`): one row per platform in `app_config`
 * (migration 0006, the package's own DDL), read through a short cache that never lets the database take the endpoint
 * down. The values are data: an operator publishes them, nothing here decides a version.
 */

export type AppConfigRow = {
  platform: string;
  min_supported_version: string;
  latest_version: string;
  update_override: string | null;
  store_url: string | null;
  maintenance_on: boolean;
  maintenance_message: Record<string, string>;
  message: Record<string, string>;
  contract_min: number;
  contract_max: number;
  contract_sunset: string | Date | null;
  flags: Record<string, FlagValue>;
  revision: number;
  updated_at: string | Date;
  updated_by: string;
};

const iso = (d: string | Date) => new Date(d).toISOString();

export function recordFromRow(row: AppConfigRow): AppConfigRecord {
  const platform = toPlatform(row.platform);
  if (!platform) throw new Error(`app_config: unknown platform ${row.platform}`);
  const override = (UPDATE_MODES as readonly string[]).includes(row.update_override ?? "") ? (row.update_override as UpdateMode) : null;
  return {
    platform,
    minSupportedVersion: row.min_supported_version,
    latestVersion: row.latest_version,
    updateOverride: override,
    storeUrl: row.store_url,
    maintenanceOn: row.maintenance_on,
    maintenanceMessage: row.maintenance_message ?? {},
    message: row.message ?? {},
    contractMin: row.contract_min,
    contractMax: row.contract_max,
    contractSunset: row.contract_sunset ? iso(row.contract_sunset).slice(0, 10) : null,
    flags: row.flags ?? {},
    revision: row.revision,
    updatedAt: iso(row.updated_at),
    updatedBy: row.updated_by,
  };
}

const postgresStore: AppConfigStore = {
  async get(platform) {
    const res = await db.execute<AppConfigRow>(sql`select * from app_config where platform = ${platform}`);
    return res.rows[0] ? recordFromRow(res.rows[0]) : undefined;
  },
};

const holder = globalThis as unknown as { __yasakiaAppConfig?: AppConfigStore };
/** The store every route reads (one per process). */
export function appConfigStore(): AppConfigStore {
  holder.__yasakiaAppConfig ??= cachedStore(postgresStore, { ttlMs: 30_000 });
  return holder.__yasakiaAppConfig;
}
