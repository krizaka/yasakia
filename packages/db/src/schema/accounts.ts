import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { accountStatusEnum, localeEnum, pushPlatformEnum } from "./enums";

/**
 * One person. Created by `POST /api/auth/verify` once the e-mail code is right and the date of birth says 18+ (checked
 * by the server). Deleting an account deletes every row that is theirs (ON DELETE CASCADE) — `account_deletions` keeps
 * only what the purge of the media needs.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Lower-cased. The only way to sign in (a 6-digit code by e-mail): no password exists. */
    email: varchar("email", { length: 254 }).notNull().unique(),
    status: accountStatusEnum("status").default("ACTIVE").notNull(),
    locale: localeEnum("locale").default("en").notNull(),
    /** Checked 18+ by the server at creation. Private: never shown to anyone, only the age is. */
    birthDate: date("birth_date").notNull(),
    /** Terms and the consent screen (what the agent learns, that everything can be changed) — the version accepted. */
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
    consentVersion: varchar("consent_version", { length: 20 }).notNull(),
    /** Bumped by "sign out everywhere": every token carrying an older version stops working at once. */
    sessionVersion: integer("session_version").default(1).notNull(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspensionReason: text("suspension_reason"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [check("accounts_email_lower", sql`${t.email} = lower(${t.email})`)],
);

/**
 * A sign-in code sent by e-mail: 6 digits, kept only as a keyed hash, valid 10 minutes, 5 attempts, used once.
 * Not tied to an account: the account may not exist yet (sign-up and sign-in are the same flow).
 */
export const authCodes = pgTable(
  "auth_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("auth_codes_email_idx").on(t.email, t.createdAt), index("auth_codes_expires_idx").on(t.expiresAt)],
);

/** The account's phones (Expo push tokens). A token moves to the account signed in on the phone. */
export const pushTokens = pgTable(
  "push_tokens",
  {
    token: varchar("token", { length: 255 }).primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    platform: pushPlatformEnum("platform").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("push_tokens_account_idx").on(t.accountId)],
);

/** Fixed-window counters of the shared rate limiter (`RATE_LIMIT_STORE=postgres`), one row per key. */
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: varchar("key", { length: 200 }).primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
