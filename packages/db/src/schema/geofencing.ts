import { sql } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, smallint, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { accounts } from "./accounts";

/**
 * Geofencing zones: administrative or curated matching boundaries with dynamic rule overrides.
 */
export const geofenceZones = pgTable(
  "geofence_zones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    slug: varchar("slug", { length: 50 }).notNull().unique(),
    active: boolean("active").default(true).notNull(),
    centerLat: doublePrecision("center_lat").notNull(),
    centerLng: doublePrecision("center_lng").notNull(),
    radiusKm: smallint("radius_km").default(50).notNull(),
    /** GeoJSON polygon coordinates for strict geofencing bounds when defined */
    polygon: jsonb("polygon").$type<{ type: "Polygon"; coordinates: number[][][] }>(),
    minAge: smallint("min_age").default(18).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("geofence_zones_active_idx").on(t.active),
    index("geofence_zones_earth_idx").using("gist", sql`ll_to_earth(${t.centerLat}, ${t.centerLng})`),
  ],
);

/**
 * Historical coarse trajectories for heatmap density and behavioral spatial analysis.
 * Stored coordinates are rounded (~1 km privacy grid) before recording; cascades on account deletion.
 */
export const userTrajectories = pgTable(
  "user_trajectories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    geoPrecisionM: integer("geo_precision_m").default(1000).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("user_trajectories_account_idx").on(t.accountId, t.recordedAt),
    index("user_trajectories_earth_idx").using("gist", sql`ll_to_earth(${t.lat}, ${t.lng})`),
  ],
);
