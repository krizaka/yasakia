import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { accounts } from "./accounts";
import { introStateEnum } from "./enums";

/**
 * Mutual interest → an intro of 7 days between two people, stored once per pair (`account_a` < `account_b`). Each
 * agent whispers a private first line to its own person (`opener_a` is shown to A only). The agent never reads the
 * messages.
 */
export const intros = pgTable(
  "intros",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountA: uuid("account_a")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    accountB: uuid("account_b")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    state: introStateEnum("state").default("OPEN").notNull(),
    openerA: text("opener_a"),
    openerB: text("opener_b"),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    continuedByAAt: timestamp("continued_by_a_at", { withTimezone: true }),
    continuedByBAt: timestamp("continued_by_b_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** BLOCKED · REPORTED · DELETED — why an intro closed before its time. */
    closedReason: varchar("closed_reason", { length: 20 }),
    /** Set while a report made in the intro is reviewed: nobody can write. */
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("intros_pair_idx").on(t.accountA, t.accountB),
    index("intros_account_b_idx").on(t.accountB),
    index("intros_expiry_idx").on(t.expiresAt).where(sql`${t.state} = 'OPEN'`),
    check("intros_ordered_pair", sql`${t.accountA} < ${t.accountB}`),
  ],
);

/** What two people write to each other in an intro — idempotent per sender `client_id`. */
export const introMessages = pgTable(
  "intro_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    introId: uuid("intro_id")
      .references(() => intros.id, { onDelete: "cascade" })
      .notNull(),
    senderId: uuid("sender_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    body: text("body").notNull(),
    clientId: varchar("client_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("intro_messages_intro_idx").on(t.introId, t.createdAt), uniqueIndex("intro_messages_client_idx").on(t.introId, t.senderId, t.clientId)],
);
