import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

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

/**
 * What the console did and who did it: sign-ins (and refusals), password changes, suspensions and restorations, account
 * deletions. Append-only; it outlives the accounts it names (set null / no foreign key on the target) and keeps no
 * secret and no content — ids, an action name and a few words of context.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** The account that acted; null for an operator-token call or once that account is deleted. */
    actorId: uuid("actor_id").references(() => accounts.id, { onDelete: "set null" }),
    /** Who, in words, at the time (an address or `operator-token`) — the log stays readable after a deletion. */
    actorLabel: varchar("actor_label", { length: 254 }),
    /** `auth.sign_in` · `auth.sign_in_refused` · `auth.password_changed` · `account.deleted` · `admin.suspend` · `admin.restore`… */
    action: varchar("action", { length: 40 }).notNull(),
    /** The account acted upon (no foreign key: the account may be deleted later). */
    targetId: uuid("target_id"),
    detail: jsonb("detail").$type<Record<string, string | number | boolean | null>>(),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_target_idx").on(t.targetId, t.createdAt), index("audit_log_action_idx").on(t.action, t.createdAt)],
);
