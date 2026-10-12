import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, primaryKey, smallint, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { accounts } from "./accounts";
import { batchDecisionEnum, batchStatusEnum } from "./enums";

/**
 * A batch: 3 to 5 people the agent unlocked for one account, mutual by construction (PY3). Expires 72 hours after it
 * opens; the next one waits for the debrief.
 */
export const batches = pgTable(
  "batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    status: batchStatusEnum("status").default("OPEN").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("batches_account_idx").on(t.accountId, t.openedAt),
    // At most one batch an account has to act on at a time (OPEN or waiting for its debrief).
    uniqueIndex("batches_one_current_idx").on(t.accountId).where(sql`${t.status} in ('OPEN', 'DEBRIEF_DUE')`),
    index("batches_expiry_idx").on(t.expiresAt).where(sql`${t.status} = 'OPEN'`),
  ],
);

/**
 * One person in a batch, with the reasons the agent wrote — in words, both ways, never a number — and the decision.
 * Having someone in a current batch (OPEN or DEBRIEF_DUE) is what lets an account see their photos.
 */
export const batchItems = pgTable(
  "batch_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .references(() => batches.id, { onDelete: "cascade" })
      .notNull(),
    candidateId: uuid("candidate_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    rank: smallint("rank").notNull(),
    reasons: jsonb("reasons").$type<{ forYou: string[]; forThem: string[] }>(),
    decision: batchDecisionEnum("decision"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Set when the person was taken out of the batch (a block, a deletion) — the item stays for the debrief's history. */
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("batch_items_batch_candidate_idx").on(t.batchId, t.candidateId), index("batch_items_candidate_idx").on(t.candidateId)],
);

/** The three answers that unlock the next batch; they move the portrait and the weights (PY3). */
export const debriefs = pgTable("debriefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id")
    .references(() => batches.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  accountId: uuid("account_id")
    .references(() => accounts.id, { onDelete: "cascade" })
    .notNull(),
  answers: jsonb("answers").$type<{ questionId: string; chips: string[]; text?: string }[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Nobody is shown twice to the same person. */
export const pairsSeen = pgTable(
  "pairs_seen",
  {
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    seenAccountId: uuid("seen_account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.seenAccountId] }), check("pairs_seen_not_self", sql`${t.accountId} <> ${t.seenAccountId}`)],
);
