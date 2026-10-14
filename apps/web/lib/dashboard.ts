import { accounts, agentSessions, batches, batchItems, db, introMessages, intros, profilePhotos, profiles, pushTokens } from "@yasakia/db";
import { and, count, desc, eq, inArray, isNull, max, or, sql } from "drizzle-orm";

/**
 * What the person's home shows, from the tables that exist: where the agent is with them, how complete their profile
 * is, the batch in front of them, their introductions and the latest word in each, and the phones that get notified.
 * Counts and dates only — never a candidate's profile, never a score (a batch's people live in the app).
 */

export interface Dashboard {
  agentState: "ONBOARDING" | "DISCOVERY" | "WAITING_POOL" | "BATCH_READY" | "BATCH_OPEN" | "DEBRIEF_DUE";
  accountStatus: "ACTIVE" | "PAUSED";
  displayName: string | null;
  profile: { done: number; total: number; missing: ("name" | "gender" | "intent" | "location" | "photo")[] };
  batch: { status: "OPEN" | "DEBRIEF_DUE"; people: number; decided: number; expiresAt: Date } | null;
  intros: { open: number; continued: number; faded: number; nextExpiry: Date | null };
  conversations: { introId: string; state: "OPEN" | "CONTINUED"; lastMessageAt: Date | null; messages: number; expiresAt: Date }[];
  notifications: { phones: number };
}

export async function dashboardFor(accountId: string): Promise<Dashboard> {
  const [head] = await db
    .select({
      status: accounts.status,
      name: profiles.displayName,
      gender: profiles.gender,
      intent: profiles.intent,
      lat: profiles.lat,
      state: agentSessions.state,
    })
    .from(accounts)
    .leftJoin(profiles, eq(profiles.accountId, accounts.id))
    .leftJoin(agentSessions, eq(agentSessions.accountId, accounts.id))
    .where(eq(accounts.id, accountId))
    .limit(1);
  const [{ photos }] = await db
    .select({ photos: sql<number>`count(*) filter (where ${profilePhotos.moderationStatus} = 'APPROVED')::int` })
    .from(profilePhotos)
    .where(eq(profilePhotos.accountId, accountId));

  const missing: Dashboard["profile"]["missing"] = [];
  if (!head?.name) missing.push("name");
  if (!head?.gender) missing.push("gender");
  if (!head?.intent) missing.push("intent");
  if (head?.lat == null) missing.push("location");
  if (!photos) missing.push("photo");

  const [current] = await db
    .select({ id: batches.id, status: batches.status, expiresAt: batches.expiresAt })
    .from(batches)
    .where(and(eq(batches.accountId, accountId), inArray(batches.status, ["OPEN", "DEBRIEF_DUE"])))
    .orderBy(desc(batches.openedAt))
    .limit(1);
  let batch: Dashboard["batch"] = null;
  if (current && (current.status === "OPEN" || current.status === "DEBRIEF_DUE")) {
    const [counts] = await db
      .select({ people: count(), decided: sql<number>`count(${batchItems.decision})::int` })
      .from(batchItems)
      .where(and(eq(batchItems.batchId, current.id), isNull(batchItems.withdrawnAt)));
    batch = { status: current.status, people: counts.people, decided: counts.decided, expiresAt: current.expiresAt };
  }

  const mine = or(eq(intros.accountA, accountId), eq(intros.accountB, accountId));
  const states = await db.select({ state: intros.state, n: count(), next: max(intros.expiresAt) }).from(intros).where(mine).groupBy(intros.state);
  const byState = (s: string) => states.find((x) => x.state === s)?.n ?? 0;

  const live = await db
    .select({
      id: intros.id,
      state: intros.state,
      expiresAt: intros.expiresAt,
      messages: sql<number>`(select count(*) from ${introMessages} where ${introMessages.introId} = ${intros.id})::int`,
      last: sql<Date | null>`(select max(${introMessages.createdAt}) from ${introMessages} where ${introMessages.introId} = ${intros.id})`,
    })
    .from(intros)
    .where(and(mine, inArray(intros.state, ["OPEN", "CONTINUED"])))
    .orderBy(desc(intros.openedAt))
    .limit(5);

  const [{ phones }] = await db.select({ phones: count() }).from(pushTokens).where(eq(pushTokens.accountId, accountId));
  const nextExpiry = states.find((x) => x.state === "OPEN")?.next ?? null;

  return {
    agentState: head?.state ?? "ONBOARDING",
    accountStatus: head?.status === "PAUSED" ? "PAUSED" : "ACTIVE",
    displayName: head?.name ?? null,
    profile: { done: 5 - missing.length, total: 5, missing },
    batch,
    intros: { open: byState("OPEN"), continued: byState("CONTINUED"), faded: byState("FADED"), nextExpiry },
    conversations: live.map((l) => ({
      introId: l.id,
      state: l.state === "CONTINUED" ? "CONTINUED" : "OPEN",
      lastMessageAt: l.last ? new Date(l.last) : null,
      messages: l.messages,
      expiresAt: l.expiresAt,
    })),
    notifications: { phones },
  };
}

export type DashboardDto = Omit<Dashboard, "batch" | "intros" | "conversations"> & {
  batch: (Omit<NonNullable<Dashboard["batch"]>, "expiresAt"> & { expiresAt: string }) | null;
  intros: Omit<Dashboard["intros"], "nextExpiry"> & { nextExpiry: string | null };
  conversations: (Omit<Dashboard["conversations"][number], "lastMessageAt" | "expiresAt"> & { lastMessageAt: string | null; expiresAt: string })[];
};

/** The dashboard as JSON (dates as ISO strings) — what the API answers and what the page hands its client. */
export function dashboardDto(d: Dashboard): DashboardDto {
  const iso = (v: Date | null) => (v ? v.toISOString() : null);
  return {
    ...d,
    batch: d.batch ? { ...d.batch, expiresAt: d.batch.expiresAt.toISOString() } : null,
    intros: { ...d.intros, nextExpiry: iso(d.intros.nextExpiry) },
    conversations: d.conversations.map((c) => ({ ...c, lastMessageAt: iso(c.lastMessageAt), expiresAt: c.expiresAt.toISOString() })),
  };
}
