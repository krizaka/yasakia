import { accountDeletions, accounts, agentSessions, auditLog, blocks, db, profilePhotos, profiles } from "@yasakia/db";
import { and, eq, sql } from "drizzle-orm";

import { applyBlockEffects } from "./access";
import { ageOn } from "./age";
import { roundPosition } from "./geo";
import { isUniqueViolation, refuse } from "./http";
import { sendTemplate } from "./mail";
import { mediaStorage } from "./media";
import { stagingKey } from "./photos";

/** Photos are removed from storage at once, retried until done, and in any case within this many days. */
export const PURGE_DEADLINE_DAYS = 30;

/** The account as its owner sees it — never the date of birth (only the age), never a score. */
export async function meView(accountId: string) {
  const [row] = await db
    .select({ account: accounts, profile: profiles, state: agentSessions.state })
    .from(accounts)
    .innerJoin(profiles, eq(profiles.accountId, accounts.id))
    .leftJoin(agentSessions, eq(agentSessions.accountId, accounts.id))
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!row) throw refuse(404, "NOT_FOUND", "Not found");
  const { account, profile } = row;
  const [{ photos }] = await db
    .select({ photos: sql<number>`count(*) filter (where ${profilePhotos.moderationStatus} = 'APPROVED')::int` })
    .from(profilePhotos)
    .where(eq(profilePhotos.accountId, accountId));
  return {
    account: { id: account.id, email: account.email, status: account.status, locale: account.locale, age: ageOn(account.birthDate), createdAt: account.createdAt },
    profile: {
      displayName: profile.displayName,
      gender: profile.gender,
      seekingGenders: profile.seekingGenders,
      ageMin: profile.ageMin,
      ageMax: profile.ageMax,
      intent: profile.intent,
      radiusKm: profile.radiusKm,
      location: profile.lat === null || profile.lng === null ? null : { lat: profile.lat, lng: profile.lng, precisionM: profile.geoPrecisionM, updatedAt: profile.locationUpdatedAt },
      approvedPhotos: photos,
    },
    agent: { state: row.state ?? "ONBOARDING" },
  };
}

export interface ProfilePatch {
  displayName?: string;
  locale?: "en" | "fr";
  gender?: "WOMAN" | "MAN" | "NON_BINARY";
  seekingGenders?: ("WOMAN" | "MAN" | "NON_BINARY")[];
  ageMin?: number;
  ageMax?: number;
  intent?: "LONG_TERM" | "OPEN_TO_LONG_TERM" | "CASUAL" | "FRIENDSHIP_FIRST" | "NOT_SURE";
  radiusKm?: number;
  /** Pause: nobody is shown this account any more (its open batches and intros stay); false resumes. */
  paused?: boolean;
}

export async function patchMe(accountId: string, patch: ProfilePatch) {
  const { locale, paused, ...profile } = patch;
  const [current] = await db.select({ ageMin: profiles.ageMin, ageMax: profiles.ageMax }).from(profiles).where(eq(profiles.accountId, accountId)).limit(1);
  const ageMin = profile.ageMin ?? current?.ageMin ?? 18;
  const ageMax = profile.ageMax ?? current?.ageMax ?? 99;
  if (ageMax < ageMin) throw refuse(400, "AGE_RANGE", "The oldest age must be at least the youngest");
  await db.transaction(async (tx) => {
    if (Object.keys(profile).length) {
      const displayName = profile.displayName?.trim().replace(/\s+/g, " ");
      await tx
        .update(profiles)
        .set({ ...profile, ...(displayName !== undefined ? { displayName } : {}), updatedAt: new Date() })
        .where(eq(profiles.accountId, accountId));
    }
    const accountSet: Partial<typeof accounts.$inferInsert> = {};
    if (locale) accountSet.locale = locale;
    if (paused !== undefined) accountSet.status = paused ? "PAUSED" : "ACTIVE";
    if (Object.keys(accountSet).length) {
      // A suspension is an operator's: pausing or resuming never lifts it.
      await tx
        .update(accounts)
        .set({ ...accountSet, updatedAt: new Date() })
        .where(and(eq(accounts.id, accountId), sql`${accounts.status} <> 'SUSPENDED'`));
    }
  });
  return meView(accountId);
}

/** The position, rounded to ~1 km **before** it is written: the exact one is never stored. */
export async function setLocation(accountId: string, lat: number, lng: number, now: Date, precisionM?: number) {
  const rounded = roundPosition(lat, lng, precisionM);
  await db
    .update(profiles)
    .set({ lat: rounded.lat, lng: rounded.lng, geoPrecisionM: rounded.precisionM, locationUpdatedAt: now, updatedAt: now })
    .where(eq(profiles.accountId, accountId));
  return rounded;
}

// ── Blocks ───────────────────────────────────────────────────────────────────────────────────────

export async function listBlocks(accountId: string) {
  const rows = await db
    .select({ id: blocks.id, accountId: blocks.blockedId, displayName: profiles.displayName, createdAt: blocks.createdAt })
    .from(blocks)
    .leftJoin(profiles, eq(profiles.accountId, blocks.blockedId))
    .where(eq(blocks.blockerId, accountId))
    .orderBy(blocks.createdAt);
  return rows;
}

/** Blocks someone: immediate, invisible to them; idempotent (blocking twice answers the same block). */
export async function blockAccount(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw refuse(400, "SELF", "You cannot block yourself");
  const [target] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, blockedId)).limit(1);
  if (!target) throw refuse(404, "NOT_FOUND", "Not found");
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: blocks.id, createdAt: blocks.createdAt })
      .from(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))
      .limit(1);
    if (existing) return { block: { id: existing.id, accountId: blockedId, createdAt: existing.createdAt }, created: false };
    try {
      const [block] = await tx.insert(blocks).values({ blockerId, blockedId }).returning();
      await applyBlockEffects(tx, blockerId, blockedId);
      return { block: { id: block.id, accountId: blockedId, createdAt: block.createdAt }, created: true };
    } catch (error) {
      if (isUniqueViolation(error)) throw refuse(409, "ALREADY_BLOCKED", "Already blocked");
      throw error;
    }
  });
}

/** Lifts one of the account's blocks (another account's block is a 404). What it closed stays closed. */
export async function unblock(blockerId: string, blockId: string): Promise<void> {
  const rows = await db
    .delete(blocks)
    .where(and(eq(blocks.id, blockId), eq(blocks.blockerId, blockerId)))
    .returning({ id: blocks.id });
  if (rows.length === 0) throw refuse(404, "NOT_FOUND", "Not found");
}

// ── Deletion ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Deletes the account for good, at once: one transaction records what the purge needs (the media keys — nothing
 * personal) and deletes the account, which cascades to every row that is theirs (profile, photos, agent, facets,
 * batches, intros and their messages, blocks, push tokens, exports). Reports they filed or that name them keep their
 * history with the account set to null. The media are purged right after the response and retried until done
 * (lib/jobs.ts), within {@link PURGE_DEADLINE_DAYS} days at most. A confirmation e-mail leaves in their language.
 */
export async function deleteAccount(accountId: string): Promise<{ deletionId: string; email: string; locale: string }> {
  const result = await db.transaction(async (tx) => {
    const [account] = await tx.select({ email: accounts.email, locale: accounts.locale }).from(accounts).where(eq(accounts.id, accountId)).for("update").limit(1);
    if (!account) throw refuse(404, "NOT_FOUND", "Not found");
    const photos = await tx.select({ key: profilePhotos.storageKey, id: profilePhotos.id, mimeType: profilePhotos.mimeType }).from(profilePhotos).where(eq(profilePhotos.accountId, accountId));
    // The final keys and any staging upload (`uploads/<account>/<photo>.<ext>`).
    const keys = photos.flatMap((p) => [p.key, stagingKey(accountId, p.id, p.mimeType)]);
    const [deletion] = await tx.insert(accountDeletions).values({ accountId, storageKeys: keys }).returning({ id: accountDeletions.id });
    await tx.execute(sql`update intros set state = 'CLOSED', closed_at = now(), closed_reason = 'DELETED' where (account_a = ${accountId} or account_b = ${accountId}) and state in ('OPEN', 'CONTINUED')`);
    // The audit log keeps what was done, not who the person was: their address is blanked from every line they acted in.
    await tx.update(auditLog).set({ actorLabel: null }).where(eq(auditLog.actorId, accountId));
    await tx.insert(auditLog).values({ action: "account.deleted", targetId: accountId });
    await tx.delete(accounts).where(eq(accounts.id, accountId));
    return { deletionId: deletion.id, email: account.email, locale: account.locale };
  });
  return result;
}

/** After the response: the confirmation e-mail (never blocks or undoes the deletion). */
export async function confirmDeletion(email: string, locale: string): Promise<void> {
  try {
    await sendTemplate("account-deleted", { to: email, locale, vars: { purgeDays: PURGE_DEADLINE_DAYS } });
  } catch (error) {
    console.error("account deletion: confirmation e-mail not sent", (error as Error).message);
  }
}

/**
 * Purges the media of deleted accounts — the oldest first, `FOR UPDATE SKIP LOCKED` so several instances share the
 * work. A key is removed from the list once deleted; a failure is recorded and retried a minute later.
 */
export async function purgeDeletedMedia(limit = 20): Promise<{ purged: number; failed: number }> {
  let purged = 0;
  let failed = 0;
  await db.transaction(async (tx) => {
    const due = await tx.execute<{ id: string; storage_keys: string[] }>(sql`
      select id, storage_keys from account_deletions
      where purged_at is null and purge_after <= now()
      order by requested_at limit ${limit} for update skip locked`);
    for (const row of due.rows) {
      const remaining: string[] = [];
      let lastError: string | null = null;
      for (const key of row.storage_keys) {
        try {
          await mediaStorage().delete(key);
        } catch (error) {
          remaining.push(key);
          lastError = (error as Error).message.slice(0, 300);
        }
      }
      if (remaining.length === 0) {
        await tx.update(accountDeletions).set({ storageKeys: [], purgedAt: new Date(), purgeLastError: null }).where(eq(accountDeletions.id, row.id));
        purged++;
      } else {
        await tx
          .update(accountDeletions)
          .set({ storageKeys: remaining, purgeLastError: lastError, purgeAfter: new Date(Date.now() + 60_000) })
          .where(eq(accountDeletions.id, row.id));
        failed++;
      }
    }
  });
  return { purged, failed };
}
