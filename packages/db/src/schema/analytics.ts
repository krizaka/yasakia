import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/** What an outbox row carries to Orazaka's analytics (ADR-081): an event, or an erasure (an account deleted). */
export const analyticsOutboxKindEnum = pgEnum("analytics_outbox_kind", ["EVENT", "ERASURE"]);

/**
 * The outbox to Orazaka's product analytics (krizaka/yasakia#86, ADR-081): a row is written after the action it
 * describes, and a background loop sends what is pending — batched, at least once (Orazaka ignores a known id),
 * retried with a doubling delay. Only pseudonyms leave (HMAC of the account id with `AI_PSEUDONYM_KEY`), never an id,
 * an e-mail, a name, a message or a place.
 */
export const analyticsOutbox = pgTable(
  "analytics_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: analyticsOutboxKindEnum("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: varchar("last_error", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("analytics_outbox_pending_idx").on(t.nextAttemptAt).where(sql`${t.sentAt} is null`)],
);
