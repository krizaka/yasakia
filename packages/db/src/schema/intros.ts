import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { accounts } from "./accounts";
import { introStateEnum } from "./enums";

/**
 * Mutual interest → an intro of 7 days between two people, stored once per pair (`account_a` < `account_b`). Every
 * message is typed by one of the two people: the AI never writes for anyone, and never reads the messages.
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

/**
 * The authenticity signal of an intro message — a signal, never a verdict: `signal` is one of four words (HAND · UNSURE ·
 * LIKELY_GENERATED · TOO_SHORT), `detector` the coarse level Orazaka's classifier gave the text (never a score), and the five
 * counters are what the composer measured of how the message arrived (typing time, characters typed and pasted, deletions) — no
 * keystroke, no timing series, no text. `signal` is null until judged; it never blocks a message. Gone with the message.
 */
export const introMessageSignals = pgTable("intro_message_signals", {
  messageId: uuid("message_id")
    .primaryKey()
    .references(() => introMessages.id, { onDelete: "cascade" }),
  /** The composer's counters; null when the client measured nothing (another client, an old app). */
  typedMs: integer("typed_ms"),
  typedChars: integer("typed_chars"),
  pastedChars: integer("pasted_chars"),
  pasteEvents: integer("paste_events"),
  deletions: integer("deletions"),
  /** LOW · MID · HIGH · UNAVAILABLE — what the engine's classifier said of the text. */
  detector: varchar("detector", { length: 12 }),
  signal: varchar("signal", { length: 20 }),
  rulesVersion: integer("rules_version"),
  /** The engine's id of the Studio run — the proof of use. */
  engineRunId: varchar("engine_run_id", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  judgedAt: timestamp("judged_at", { withTimezone: true }),
});
