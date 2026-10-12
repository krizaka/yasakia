import { accounts, batches, batchItems, blocks, db, intros } from "@yazakia/db";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

/**
 * Who may see what of whom — every rule that decides access lives here, never in a route.
 *
 * Photos are private: a photo is seen by its owner, and by someone else only when it is APPROVED, its owner is not
 * suspended, nobody blocked anybody, and the viewer has the owner in a **current batch** (OPEN or waiting for its
 * debrief, not withdrawn) or shares an **intro** with them that is OPEN or CONTINUED. Anyone else gets a 404 — the
 * photo does not exist for them.
 */

export interface RelationshipFacts {
  /** Either one blocked the other (a block is mutual in effect). */
  blocked: boolean;
  /** The viewer has the owner in a batch that is OPEN or DEBRIEF_DUE, and the item was not withdrawn. */
  inCurrentBatch: boolean;
  /** An intro between them is OPEN or CONTINUED. */
  liveIntro: boolean;
}

export interface PhotoAccessInput extends RelationshipFacts {
  viewerId: string;
  ownerId: string;
  ownerStatus: "ACTIVE" | "PAUSED" | "SUSPENDED";
  moderationStatus: "UPLOADING" | "PENDING" | "APPROVED" | "REJECTED";
}

export type PhotoAccess = { allowed: true; as: "owner" | "batch" | "intro" } | { allowed: false; reason: "NO_BYTES" | "NOT_APPROVED" | "SUSPENDED" | "BLOCKED" | "NO_RELATIONSHIP" };

/** The photo rule, pure — the route reads the facts, this decides. */
export function photoAccess(input: PhotoAccessInput): PhotoAccess {
  if (input.moderationStatus === "UPLOADING") return { allowed: false, reason: "NO_BYTES" };
  if (input.viewerId === input.ownerId) return { allowed: true, as: "owner" };
  if (input.moderationStatus !== "APPROVED") return { allowed: false, reason: "NOT_APPROVED" };
  if (input.ownerStatus === "SUSPENDED") return { allowed: false, reason: "SUSPENDED" };
  if (input.blocked) return { allowed: false, reason: "BLOCKED" };
  if (input.inCurrentBatch) return { allowed: true, as: "batch" };
  if (input.liveIntro) return { allowed: true, as: "intro" };
  return { allowed: false, reason: "NO_RELATIONSHIP" };
}

/** Whether either account blocked the other. */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a))))
    .limit(1);
  return Boolean(row);
}

/** The facts between a viewer and another account, in three small indexed queries. */
export async function relationshipFacts(viewerId: string, ownerId: string): Promise<RelationshipFacts> {
  const [blocked, batchRow, introRow] = await Promise.all([
    isBlockedEitherWay(viewerId, ownerId),
    db
      .select({ id: batchItems.id })
      .from(batchItems)
      .innerJoin(batches, eq(batches.id, batchItems.batchId))
      .where(and(eq(batches.accountId, viewerId), eq(batchItems.candidateId, ownerId), isNull(batchItems.withdrawnAt), inArray(batches.status, ["OPEN", "DEBRIEF_DUE"])))
      .limit(1),
    db
      .select({ id: intros.id })
      .from(intros)
      .where(
        and(
          eq(intros.accountA, viewerId < ownerId ? viewerId : ownerId),
          eq(intros.accountB, viewerId < ownerId ? ownerId : viewerId),
          inArray(intros.state, ["OPEN", "CONTINUED"]),
        ),
      )
      .limit(1),
  ]);
  return { blocked, inCurrentBatch: batchRow.length > 0, liveIntro: introRow.length > 0 };
}

/** The status of an account (null when it does not exist). */
export async function accountStatus(accountId: string): Promise<"ACTIVE" | "PAUSED" | "SUSPENDED" | null> {
  const [row] = await db.select({ status: accounts.status }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  return row?.status ?? null;
}

/**
 * What a block does at once, in the same transaction as the block: their intro closes, and each is withdrawn from the
 * other's current batch — both ways, invisibly (nobody is told).
 */
export async function applyBlockEffects(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], blockerId: string, blockedId: string): Promise<void> {
  const [a, b] = blockerId < blockedId ? [blockerId, blockedId] : [blockedId, blockerId];
  await tx
    .update(intros)
    .set({ state: "CLOSED", closedAt: new Date(), closedReason: "BLOCKED" })
    .where(and(eq(intros.accountA, a), eq(intros.accountB, b), inArray(intros.state, ["OPEN", "CONTINUED"])));
  await tx.execute(sql`
    update batch_items set withdrawn_at = now()
    from batches
    where batches.id = batch_items.batch_id
      and batch_items.withdrawn_at is null
      and batches.status in ('OPEN', 'DEBRIEF_DUE')
      and ((batches.account_id = ${blockerId} and batch_items.candidate_id = ${blockedId})
        or (batches.account_id = ${blockedId} and batch_items.candidate_id = ${blockerId}))`);
}
