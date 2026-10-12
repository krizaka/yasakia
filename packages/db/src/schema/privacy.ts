import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { accounts } from "./accounts";
import { exportStatusEnum } from "./enums";

/**
 * An export of everything the account holds (`GET /api/me/export`), built in the background when it takes more than a
 * second. The JSON is sealed (context `account_exports:<id>`) and kept 24 hours; it goes with the account.
 */
export const accountExports = pgTable(
  "account_exports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    status: exportStatusEnum("status").default("PENDING").notNull(),
    payloadSealed: text("payload_sealed"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("account_exports_account_idx").on(t.accountId), index("account_exports_expiry_idx").on(t.expiresAt)],
);

/**
 * What remains of a deleted account: nothing personal — its id (no foreign key: the account is gone), when, and the
 * storage keys of its media until the purge has removed them from Bunny (at once, retried until done, at most 30 days).
 */
export const accountDeletions = pgTable(
  "account_deletions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    /** Emptied by the purge, key by key. */
    storageKeys: text("storage_keys").array().notNull(),
    purgeAfter: timestamp("purge_after", { withTimezone: true }).defaultNow().notNull(),
    /** The last purge failure (a Bunny outage), kept for the retry and the operator. */
    purgeLastError: text("purge_last_error"),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
  },
  (t) => [index("account_deletions_pending_idx").on(t.purgeAfter)],
);
