import { type AiProvider, AiUnavailableError } from "@yasakia/ai";
import { db, photoChecks, profilePhotos } from "@yasakia/db";
import { checkThumbnail } from "@yasakia/media";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { aiProvider, ConfigurationError } from "./env";
import { refuse } from "./http";
import { mediaStorage } from "./media";
import { describeCheck, type PhotoCheckView, type PhotoRows, type StoredCheck } from "./photo-rules";
import { limitAction } from "./rate-limit";
import { photoRules } from "./rule-sets";

/**
 * The check of the person's photo set by Orazaka (`profile-photo-check`, krizaka/orazaka-packs): enough photos, enough with
 * a face, the same person throughout, nothing written over the picture. A request is a row (`photo_checks`), worked by the
 * background loop — the engine reads up to six photos with a vision model, which takes seconds to a minute —, and the
 * screen asks for the view until it is done. The verdict is **codes** and belongs to one set of photos (`photo_set_hash`).
 */

/** The set an account has now, as the database hashes it (the one definition: the SQL function). */
async function currentSet(accountId: string): Promise<{ photos: PhotoRows; hash: string }> {
  const photos = await db
    .select({ id: profilePhotos.id, position: profilePhotos.position })
    .from(profilePhotos)
    .where(and(eq(profilePhotos.accountId, accountId), eq(profilePhotos.moderationStatus, "APPROVED")))
    .orderBy(asc(profilePhotos.position), asc(profilePhotos.createdAt));
  const res = await db.execute<{ hash: string }>(sql`select photo_set_hash(${accountId}::uuid) as hash`);
  return { photos, hash: res.rows[0]?.hash ?? "" };
}

async function latestCheck(accountId: string): Promise<(StoredCheck & { id: string }) | null> {
  const [row] = await db.select().from(photoChecks).where(eq(photoChecks.accountId, accountId)).orderBy(desc(photoChecks.createdAt)).limit(1);
  if (!row) return null;
  return { id: row.id, status: row.status as StoredCheck["status"], setHash: row.setHash, photoIds: row.photoIds, passes: row.passes, report: row.report, errorCode: row.errorCode };
}

/** What the person sees of their photos' check right now. */
export async function photoCheckView(accountId: string): Promise<PhotoCheckView> {
  const [{ params }, set, latest] = await Promise.all([photoRules(), currentSet(accountId), latestCheck(accountId)]);
  return describeCheck({ rules: params, photos: set.photos, currentHash: set.hash, latest });
}

/** Whether the account's photo set passed the check (the condition of a batch, and of being shown in one). */
export async function photosVerified(accountId: string): Promise<boolean> {
  return (await photoCheckView(accountId)).verified;
}

/** Opening a batch needs photos that passed: the refusal carries what is still missing, as codes. */
export async function requirePhotosVerified(accountId: string): Promise<void> {
  const view = await photoCheckView(accountId);
  if (view.verified) return;
  throw refuse(409, "PHOTOS_REQUIRED", "Your photos have not passed the check yet", { state: view.state, rules: view.rules, counts: view.counts, blockers: view.blockers });
}

/**
 * Asks for a check of the photos the account has now (idempotent: the one in progress, or the verdict of this very set,
 * is the answer). 409 `NO_PHOTOS` without a photo, `TOO_MANY_PHOTOS` above the maximum (nothing is sent to the engine).
 */
export async function requestPhotoCheck(req: Request, accountId: string): Promise<PhotoCheckView> {
  await limitAction("photo-check", req, accountId, { perSubject: [30, 3600], perIp: [60, 3600] });
  return queuePhotoCheck(accountId);
}

/** {@link requestPhotoCheck} without the rate limit (the caller has decided). */
export async function queuePhotoCheck(accountId: string): Promise<PhotoCheckView> {
  const { params, version } = await photoRules().then((r) => ({ params: r.params, version: r.version }));
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`photo-check:${accountId}`}))`);
    const photos = await tx
      .select({ id: profilePhotos.id })
      .from(profilePhotos)
      .where(and(eq(profilePhotos.accountId, accountId), eq(profilePhotos.moderationStatus, "APPROVED")))
      .orderBy(asc(profilePhotos.position), asc(profilePhotos.createdAt));
    if (photos.length === 0) throw refuse(409, "NO_PHOTOS", "Add a photo first");
    if (photos.length > params.maxPhotos) throw refuse(409, "TOO_MANY_PHOTOS", `A profile holds ${params.maxPhotos} photos at most`, { max: params.maxPhotos });
    const hash = (await tx.execute<{ hash: string }>(sql`select photo_set_hash(${accountId}::uuid) as hash`)).rows[0].hash;
    const [latest] = await tx.select().from(photoChecks).where(eq(photoChecks.accountId, accountId)).orderBy(desc(photoChecks.createdAt)).limit(1);
    // The one in progress, or the verdict already given for this very set, is the answer; an engine that was out of reach is asked again.
    if (latest && (latest.status === "QUEUED" || latest.status === "RUNNING" || (latest.status === "DONE" && latest.setHash === hash))) return;
    await tx.insert(photoChecks).values({ accountId, setHash: hash, photoIds: photos.map((p) => p.id), rulesVersion: version });
  });
  processSoon();
  return photoCheckView(accountId);
}

/** A check is claimed by one instance (`FOR UPDATE SKIP LOCKED`), RUNNING, so two never read the same photos. */
async function claimNext(): Promise<(typeof photoChecks.$inferSelect) | null> {
  const res = await db.execute<{ id: string }>(sql`
    update photo_checks set status = 'RUNNING', started_at = now()
    where id = (select id from photo_checks where status = 'QUEUED' order by created_at for update skip locked limit 1)
    returning id`);
  const id = res.rows[0]?.id;
  if (!id) return null;
  const [row] = await db.select().from(photoChecks).where(eq(photoChecks.id, id)).limit(1);
  return row ?? null;
}

/** Works the next queued check with the given engine. Returns whether there was one. */
export async function processNextPhotoCheck(ai?: AiProvider): Promise<boolean> {
  const claimed = await claimNext();
  if (!claimed) return false;
  const finish = async (values: Partial<typeof photoChecks.$inferInsert>) => {
    await db.update(photoChecks).set({ ...values, finishedAt: new Date() }).where(eq(photoChecks.id, claimed.id));
    // Photos were added or removed while the engine was reading: the set has moved, so the verdict is about another one — check the new one.
    const now = (await db.execute<{ hash: string }>(sql`select photo_set_hash(${claimed.accountId}::uuid) as hash`)).rows[0]?.hash ?? "";
    if (now && now !== claimed.setHash) await queuePhotoCheck(claimed.accountId).catch(() => undefined);
  };
  try {
    const rows = await db
      .select({ id: profilePhotos.id, storageKey: profilePhotos.storageKey })
      .from(profilePhotos)
      .where(and(eq(profilePhotos.accountId, claimed.accountId), inArray(profilePhotos.id, claimed.photoIds), eq(profilePhotos.moderationStatus, "APPROVED")));
    const byId = new Map(rows.map((r) => [r.id, r]));
    // A photo removed since the request: the check is about a set that no longer exists — nothing is sent, the screen asks again.
    if (claimed.photoIds.some((id) => !byId.has(id))) return await finish({ status: "ERROR", errorCode: "SET_CHANGED" }).then(() => true);
    const storage = mediaStorage();
    const thumbnails: Buffer[] = [];
    for (const id of claimed.photoIds) {
      const bytes = await storage.get(byId.get(id)!.storageKey);
      if (!bytes) return await finish({ status: "ERROR", errorCode: "MEDIA_MISSING" }).then(() => true);
      thumbnails.push(await checkThumbnail(bytes));
    }
    const { params } = await photoRules();
    const result = await (ai ?? aiProvider()).checkPhotos({ photos: thumbnails, counts: params });
    if (result.report.photos.length !== claimed.photoIds.length) throw new AiUnavailableError("bad_response", "The check answered about another number of photos");
    console.log(`[photos] check ${claimed.id} run=${result.runId} photos=${thumbnails.length} passes=${result.report.passes} ms=${result.ms}`);
    await finish({ status: "DONE", passes: result.report.passes, report: result.report as unknown as Record<string, unknown>, engineRunId: result.runId });
  } catch (error) {
    const code = error instanceof AiUnavailableError ? error.code : error instanceof ConfigurationError ? "NOT_CONFIGURED" : "FAILED";
    console.error(`[photos] check ${claimed.id} ended in error: ${code}`);
    await finish({ status: "ERROR", errorCode: code });
  }
  return true;
}

const holder = globalThis as unknown as { __yasakiaPhotoCheckBusy?: boolean };

/** Works the queue now, one check at a time per process (the engine reads photos one set at a time). Never throws. */
export function processSoon(): void {
  if (holder.__yasakiaPhotoCheckBusy) return;
  holder.__yasakiaPhotoCheckBusy = true;
  void (async () => {
    try {
      while (await processNextPhotoCheck()) {
        /* the next one */
      }
    } catch (error) {
      console.error("[photos] the check loop failed:", (error as Error).message);
    } finally {
      holder.__yasakiaPhotoCheckBusy = false;
    }
  })();
}

/** A check RUNNING for too long (an instance died) is given up as an error, so the person can ask again. */
export async function sweepPhotoChecks(minutes = 15): Promise<number> {
  const stale = await db
    .update(photoChecks)
    .set({ status: "ERROR", errorCode: "TIMEOUT", finishedAt: new Date() })
    .where(and(eq(photoChecks.status, "RUNNING"), lt(photoChecks.startedAt, sql`now() - make_interval(mins => ${minutes})`)))
    .returning({ id: photoChecks.id });
  return stale.length;
}
