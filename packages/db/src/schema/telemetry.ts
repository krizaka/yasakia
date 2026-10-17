import { index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * Telemetry events for Orazaka Data Analysis & local behavioral aggregation.
 * Account identifiers are pseudonymized with HMAC-SHA256 per Loi 25 compliance.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountIdPseudonym: varchar("account_id_pseudonym", { length: 64 }).notNull(),
    eventType: varchar("event_type", { length: 60 }).notNull(),
    properties: jsonb("properties").$type<Record<string, unknown>>().default({}).notNull(),
    geohash: varchar("geohash", { length: 12 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("analytics_events_type_idx").on(t.eventType, t.occurredAt),
    index("analytics_events_pseudonym_idx").on(t.accountIdPseudonym, t.occurredAt),
    index("analytics_events_geohash_idx").on(t.geohash),
  ],
);
