import { sql } from "drizzle-orm";
import { check, doublePrecision, index, integer, pgTable, smallint, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

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
