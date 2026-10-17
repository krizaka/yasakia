import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, index, integer, jsonb, pgTable, smallint, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { accounts } from "./accounts";
import { genderEnum, photoModerationStatusEnum, relationshipIntentEnum } from "./enums";

/**
 * What the matching filters on. The position is **rounded to about 1 km before it is written** (apps/web/lib/geo.ts):
 * the exact one never exists here; `geo_precision_m` says how coarse it is. Distances use PostgreSQL's
 * `earthdistance` over the GiST index on `ll_to_earth(lat, lng)`.
 */
export const profiles = pgTable(
  "profiles",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** A first name or a nickname — shown to the people of a batch. */
    displayName: varchar("display_name", { length: 40 }),
    gender: genderEnum("gender"),
    /** Who the person wants to meet (empty: not said yet). */
    seekingGenders: genderEnum("seeking_genders")
      .array()
      .default(sql`'{}'::gender[]`)
      .notNull(),
    ageMin: smallint("age_min").default(18).notNull(),
    ageMax: smallint("age_max").default(99).notNull(),
    intent: relationshipIntentEnum("intent"),
    /** How far the person accepts to go; a candidate must be inside both radii. */
    radiusKm: smallint("radius_km").default(25).notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    geoPrecisionM: integer("geo_precision_m"),
    locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true }),
    /** Set when the agent's onboarding is done (PY3) — an eligibility condition of the matching. */
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("profiles_earth_idx").using("gist", sql`ll_to_earth(${t.lat}, ${t.lng})`),
    check("profiles_age_range", sql`${t.ageMin} >= 18 and ${t.ageMax} >= ${t.ageMin} and ${t.ageMax} <= 120`),
    check("profiles_radius", sql`${t.radiusKm} between 1 and 500`),
    check("profiles_position_pair", sql`(${t.lat} is null) = (${t.lng} is null)`),
  ],
);

/**
 * A profile photo. The bytes live in Bunny Storage (or `.storage/` locally) under `storage_key` — never served as such:
 * `GET /api/photos/{id}` evaluates who may see it and signs a 300-second URL. Re-encoded at completion (orientation
 * applied, metadata — GPS included — stripped).
 */
export const profilePhotos = pgTable(
  "profile_photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    storageKey: varchar("storage_key", { length: 200 }).notNull().unique(),
    mimeType: varchar("mime_type", { length: 40 }).notNull(),
    /** The size declared when the upload was signed, then the stored size once completed. */
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    blurhash: varchar("blurhash", { length: 100 }),
    moderationStatus: photoModerationStatusEnum("moderation_status").default("UPLOADING").notNull(),
    /** 0 first; the order the person chose. */
    position: smallint("position").default(0).notNull(),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("profile_photos_account_idx").on(t.accountId, t.position)],
);

/**
 * A check of the account's photo set by Orazaka's `profile-photo-check` Studio: faces present, the same person throughout,
 * nothing written over the picture. A row is one request; `QUEUED → RUNNING → DONE | ERROR`, one active at a time per
 * account. `report` holds **codes only** (never a score, a vector or a face box — the engine's worker keeps none);
 * `set_hash` is `photo_set_hash(account)` when the check was requested, so a changed photo set makes any earlier verdict
 * stale without a write. `engine_run_id` is the proof of use: the line in Orazaka's logs.
 */
export const photoChecks = pgTable(
  "photo_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    status: varchar("status", { length: 10 }).default("QUEUED").notNull(),
    setHash: varchar("set_hash", { length: 64 }).notNull(),
    /** The photos checked, in the order they were sent — the report's `index` is a position in this list. */
    photoIds: uuid("photo_ids").array().notNull(),
    rulesVersion: integer("rules_version").notNull(),
    passes: boolean("passes"),
    report: jsonb("report").$type<Record<string, unknown>>(),
    engineRunId: varchar("engine_run_id", { length: 80 }),
    errorCode: varchar("error_code", { length: 30 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("photo_checks_account_idx").on(t.accountId, t.createdAt),
    uniqueIndex("photo_checks_one_active_idx")
      .on(t.accountId)
      .where(sql`${t.status} in ('QUEUED', 'RUNNING')`),
    check("photo_checks_status", sql`${t.status} in ('QUEUED', 'RUNNING', 'DONE', 'ERROR')`),
    check("photo_checks_done_has_verdict", sql`${t.status} <> 'DONE' or (${t.passes} is not null and ${t.report} is not null)`),
  ],
);

/**
 * The explicit, separate consent to compare one's photos with each other (Québec Law 25: comparing faces is biometric
 * processing). One row per account: `accepted_at` is when the person agreed to the wording of `version`, `withdrawn_at` when
 * they took it back (the comparison stops at once). Nothing biometric is kept either way — the engine compares in memory.
 */
export const biometricConsents = pgTable("biometric_consents", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  version: varchar("version", { length: 20 }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
});
