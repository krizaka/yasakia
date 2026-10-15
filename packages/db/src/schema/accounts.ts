import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { accountRoleEnum, accountStatusEnum, localeEnum, pushPlatformEnum } from "./enums";

/**
 * One person. Created by `POST /api/auth/verify` once the e-mail code is right and the date of birth says 18+ (checked
 * by the server). Deleting an account deletes every row that is theirs (ON DELETE CASCADE) — `account_deletions` keeps
 * only what the purge of the media needs.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Lower-cased. The app signs in with a 6-digit code by e-mail; the web console may also hold a password (`account_credentials`). */
    email: varchar("email", { length: 254 }).notNull().unique(),
    status: accountStatusEnum("status").default("ACTIVE").notNull(),
    /** USER by default; ADMIN is granted by an operator (`npm run db:qa-accounts`, never by the person). */
    role: accountRoleEnum("role").default("USER").notNull(),
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

/**
 * A password reset code, sent by e-mail: 6 digits, kept only as a keyed hash, valid 10 minutes, 5 attempts, used once.
 * Its own table, not auth_codes: a reset never signs anyone in by itself.
 */
export const passwordResetCodes = pgTable(
  "password_reset_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("password_reset_codes_email_idx").on(t.email, t.createdAt)],
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

/** Fixed-window counters of the shared rate limiter (`ABUSE_RATE_LIMIT_STORE=postgres`), one row per key. */
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: varchar("key", { length: 200 }).primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/**
 * A password, for the web console only (the app keeps signing in by e-mail code). Provisioned by an operator
 * (`npm run db:qa-accounts`), changed by the person; kept as a salted scrypt hash, never the password itself.
 */
export const accountCredentials = pgTable("account_credentials", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A browser session of the web console: an opaque random token in an HttpOnly cookie, kept only as its SHA-256. One row
 * per device, so the person sees where they are signed in and can end any of them; revoked or expired rows are swept.
 */
export const webSessions = pgTable(
  "web_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    /** What the browser said it was, trimmed — shown as « Safari on macOS » style text, never trusted. */
    userAgent: varchar("user_agent", { length: 300 }),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("web_sessions_account_idx").on(t.accountId), index("web_sessions_expiry_idx").on(t.expiresAt)],
);
