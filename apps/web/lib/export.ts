import {
  accountExports,
  accounts,
  agentMessages,
  agentSessions,
  aiCalls,
  batches,
  batchItems,
  blocks,
  db,
  debriefs,
  introMessages,
  intros,
  open,
  openJson,
  profilePhotos,
  profiles,
  pushTokens,
  readFacets,
  reports,
  sealJson,
} from "@yazakia/db";
import { and, asc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";

import { setting } from "./env";
import { refuse } from "./http";

/**
 * The export of everything an account holds (Loi 25 / GDPR portability) — `GET /api/me/export`. Built at once when it
 * takes less than APP_EXPORT_SYNC_BUDGET_MS (1 s); otherwise the answer is 202 with an export id, the build goes on in the
 * background, and `GET /api/me/export?id=` returns it when ready. A stored export is sealed (it holds the decrypted
 * sensitive facets), kept 24 hours, and goes with the account.
 *
 * What is someone else's stays out: the messages *they* wrote in an intro, *their* reasons, *their* decisions.
 */

export const EXPORT_TTL_HOURS = 24;
export const EXPORT_FORMAT = "yazakia-export/1";

const exportContext = (id: string) => `account_exports:${id}`;

export async function buildExport(accountId: string) {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) throw refuse(404, "NOT_FOUND", "Not found");
  const [profile] = await db.select().from(profiles).where(eq(profiles.accountId, accountId)).limit(1);
  const [session] = await db.select().from(agentSessions).where(eq(agentSessions.accountId, accountId)).limit(1);
  const [photos, messages, facetList, myBatches, myIntros, myBlocks, myReports, phones, calls] = await Promise.all([
    db.select().from(profilePhotos).where(eq(profilePhotos.accountId, accountId)).orderBy(asc(profilePhotos.position)),
    session ? db.select().from(agentMessages).where(eq(agentMessages.sessionId, session.id)).orderBy(asc(agentMessages.createdAt)) : Promise.resolve([]),
    readFacets(db, accountId),
    db.select().from(batches).where(eq(batches.accountId, accountId)).orderBy(asc(batches.openedAt)),
    db.select().from(intros).where(or(eq(intros.accountA, accountId), eq(intros.accountB, accountId))).orderBy(asc(intros.openedAt)),
    db.select({ accountId: blocks.blockedId, createdAt: blocks.createdAt }).from(blocks).where(eq(blocks.blockerId, accountId)),
    db.select().from(reports).where(eq(reports.reporterId, accountId)).orderBy(asc(reports.createdAt)),
    db.select({ platform: pushTokens.platform, createdAt: pushTokens.createdAt, lastSeenAt: pushTokens.lastSeenAt }).from(pushTokens).where(eq(pushTokens.accountId, accountId)),
    db
      .select({ purpose: aiCalls.purpose, calls: sql<number>`count(*)::int`, tokensIn: sql<number>`coalesce(sum(${aiCalls.tokensIn}), 0)::int`, tokensOut: sql<number>`coalesce(sum(${aiCalls.tokensOut}), 0)::int` })
      .from(aiCalls)
      .where(eq(aiCalls.accountId, accountId))
      .groupBy(aiCalls.purpose),
  ]);
  const batchIds = myBatches.map((b) => b.id);
  const introIds = myIntros.map((i) => i.id);
  const [items, myDebriefs, myMessages] = await Promise.all([
    batchIds.length ? db.select().from(batchItems).where(inArray(batchItems.batchId, batchIds)) : Promise.resolve([]),
    batchIds.length ? db.select().from(debriefs).where(inArray(debriefs.batchId, batchIds)) : Promise.resolve([]),
    introIds.length
      ? db
          .select()
          .from(introMessages)
          .where(and(inArray(introMessages.introId, introIds), eq(introMessages.senderId, accountId)))
          .orderBy(asc(introMessages.createdAt))
      : Promise.resolve([]),
  ]);
  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    account: {
      id: account.id,
      email: account.email,
      status: account.status,
      locale: account.locale,
      birthDate: account.birthDate,
      termsAcceptedAt: account.termsAcceptedAt,
      consentVersion: account.consentVersion,
      createdAt: account.createdAt,
      lastSeenAt: account.lastSeenAt,
    },
    profile: profile
      ? {
          displayName: profile.displayName,
          gender: profile.gender,
          seekingGenders: profile.seekingGenders,
          ageMin: profile.ageMin,
          ageMax: profile.ageMax,
          intent: profile.intent,
          radiusKm: profile.radiusKm,
          location: profile.lat === null ? null : { lat: profile.lat, lng: profile.lng, precisionM: profile.geoPrecisionM, note: "rounded to ~1 km before it was stored", updatedAt: profile.locationUpdatedAt },
        }
      : null,
    photos: photos.map((p) => ({ id: p.id, status: p.moderationStatus, position: p.position, width: p.width, height: p.height, createdAt: p.createdAt, note: "the picture itself: GET /api/photos/{id}" })),
    agent: session ? { state: session.state, portrait: session.portrait, tokensUsed: session.tokensUsed, createdAt: session.createdAt } : null,
    agentMessages: messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
    facets: facetList,
    batches: myBatches.map((b) => ({
      id: b.id,
      status: b.status,
      openedAt: b.openedAt,
      expiresAt: b.expiresAt,
      items: items.filter((i) => i.batchId === b.id).map((i) => ({ candidateId: i.candidateId, reasonsForYou: i.reasons?.forYou ?? [], decision: i.decision, decidedAt: i.decidedAt })),
      debrief: myDebriefs.find((d) => d.batchId === b.id)?.answers ?? null,
    })),
    intros: myIntros.map((i) => ({
      id: i.id,
      with: i.accountA === accountId ? i.accountB : i.accountA,
      state: i.state,
      openedAt: i.openedAt,
      yourOpener: i.accountA === accountId ? i.openerA : i.openerB,
      yourMessages: myMessages.filter((m) => m.introId === i.id).map((m) => ({ body: m.body, createdAt: m.createdAt })),
    })),
    blocks: myBlocks,
    reportsFiled: myReports.map((r) => ({
      id: r.id,
      about: r.reportedId,
      reason: r.reason,
      details: r.detailsSealed ? open(r.detailsSealed, `reports:${r.id}:details`) : null,
      status: r.status,
      createdAt: r.createdAt,
    })),
    phones,
    aiUsage: calls,
  };
}

export type AccountExport = Awaited<ReturnType<typeof buildExport>>;

const timeout = (ms: number) => new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms));

/**
 * The export now (`{ ready: true, data }`) or, past the budget — or when the client asks for `async` — an export id to
 * poll (`{ ready: false, id }`); `schedule` keeps the background build alive after the response (Next's `after`).
 */
export async function startExport(accountId: string, options: { async?: boolean; schedule: (task: () => Promise<void>) => void }) {
  const build = buildExport(accountId);
  const budget = setting("APP_EXPORT_SYNC_BUDGET_MS", 1000, 0, 30_000);
  const first = options.async ? "timeout" : await Promise.race([build, timeout(budget)]);
  if (first !== "timeout") return { ready: true as const, data: first };
  const [row] = await db
    .insert(accountExports)
    .values({ accountId, expiresAt: new Date(Date.now() + EXPORT_TTL_HOURS * 3_600_000) })
    .returning({ id: accountExports.id });
  options.schedule(async () => {
    try {
      const data = await build;
      await db.update(accountExports).set({ status: "READY", payloadSealed: sealJson(data, exportContext(row.id)), readyAt: new Date() }).where(eq(accountExports.id, row.id));
    } catch (error) {
      console.error("export failed", error);
      await db.update(accountExports).set({ status: "FAILED" }).where(eq(accountExports.id, row.id));
    }
  });
  build.catch(() => undefined);
  return { ready: false as const, id: row.id };
}

/** A stored export of this account (another account's id is a 404). */
export async function readExport(accountId: string, id: string) {
  const [row] = await db
    .select()
    .from(accountExports)
    .where(and(eq(accountExports.id, id), eq(accountExports.accountId, accountId), gt(accountExports.expiresAt, new Date())))
    .limit(1);
  if (!row) throw refuse(404, "NOT_FOUND", "Not found");
  if (row.status === "FAILED") throw refuse(500, "EXPORT_FAILED", "The export failed — ask for a new one");
  if (row.status === "PENDING" || !row.payloadSealed) return { ready: false as const, id: row.id };
  return { ready: true as const, data: openJson<AccountExport>(row.payloadSealed, exportContext(row.id)) };
}

/** Removes expired exports (the background loop). */
export async function sweepExports(now = new Date()): Promise<number> {
  const rows = await db.delete(accountExports).where(lt(accountExports.expiresAt, now)).returning({ id: accountExports.id });
  return rows.length;
}
