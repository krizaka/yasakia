import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, smallint, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

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
    /** TEXT · PHOTO · VIDEO · AUDIO. A media message has an empty `body` and its file in `intro_media`. */
    kind: varchar("kind", { length: 8 }).default("TEXT").notNull(),
    clientId: varchar("client_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("intro_messages_intro_idx").on(t.introId, t.createdAt),
    uniqueIndex("intro_messages_client_idx").on(t.introId, t.senderId, t.clientId),
    check("intro_messages_kind", sql`${t.kind} in ('TEXT', 'PHOTO', 'VIDEO', 'AUDIO')`),
  ],
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

/**
 * The file of a media message — a photo, a short video or a voice message — private on Bunny (`messages/<intro>/<message>.<ext>`),
 * never served as such: `GET /api/intros/{id}/media/{messageId}` evaluates who asks and signs a 300-second URL. Nothing is edited: the
 * file is only made clean (metadata removed), measured and judged. `status`: UPLOADING → PENDING (waiting for the safety check —
 * Orazaka's `media-safety`, which fails closed) → APPROVED (the other person can see it) | REJECTED (deleted) | GONE (the conversation ended: deleted). The limits are the
 * MEDIA rule set's. It goes with the message, and its bytes with the conversation (faded, closed, or an account deleted).
 */
export const introMedia = pgTable(
  "intro_media",
  {
    messageId: uuid("message_id")
      .primaryKey()
      .references(() => introMessages.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 8 }).notNull(),
    status: varchar("status", { length: 10 }).default("UPLOADING").notNull(),
    storageKey: varchar("storage_key", { length: 200 }).notNull().unique(),
    posterKey: varchar("poster_key", { length: 200 }),
    mimeType: varchar("mime_type", { length: 40 }).notNull(),
    /** The declared size, then the stored size. */
    bytes: integer("bytes").notNull(),
    durationMs: integer("duration_ms"),
    /** 64 peaks, 0 to 100, for a voice message's waveform. */
    waveform: smallint("waveform").array(),
    /** The codes the safety check raised (words in the app, never the engine's). */
    moderationCodes: text("moderation_codes").array(),
    engineRunId: varchar("engine_run_id", { length: 80 }),
    /** How many times the safety check was tried and could not decide. */
    attempts: smallint("attempts").default(0).notNull(),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    index("intro_media_status_idx").on(t.status, t.createdAt),
    check("intro_media_kind", sql`${t.kind} in ('PHOTO', 'VIDEO', 'AUDIO')`),
    check("intro_media_status_known", sql`${t.status} in ('UPLOADING', 'PENDING', 'APPROVED', 'REJECTED', 'GONE')`),
  ],
);
