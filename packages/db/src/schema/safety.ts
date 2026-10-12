import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { accounts } from "./accounts";
import { reportReasonEnum, reportStatusEnum } from "./enums";

/**
 * A block: immediate, mutual in effect (neither sees the other again, anywhere) and invisible to the blocked person.
 * Lifting it does not bring back what it closed.
 */
export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blockerId: uuid("blocker_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    blockedId: uuid("blocked_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("blocks_pair_idx").on(t.blockerId, t.blockedId),
    index("blocks_blocked_idx").on(t.blockedId),
    check("blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);

/**
 * A report, persisted **before** it is acknowledged. The free-text details are sealed (AES-256-GCM, context
 * `reports:<id>:details`) and read only by operators (`GET /api/admin/reports`). A report outlives the accounts it
 * names (set null): moderation keeps its history.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterId: uuid("reporter_id").references(() => accounts.id, { onDelete: "set null" }),
    reportedId: uuid("reported_id").references(() => accounts.id, { onDelete: "set null" }),
    reason: reportReasonEnum("reason").notNull(),
    detailsSealed: text("details_sealed"),
    /** Where it happened: a photo, an intro (ids, no foreign key — the thing may be deleted later). */
    photoId: uuid("photo_id"),
    introId: uuid("intro_id"),
    status: reportStatusEnum("status").default("OPEN").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [index("reports_status_idx").on(t.status, t.createdAt), index("reports_reported_idx").on(t.reportedId)],
);
