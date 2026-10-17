import { accounts, db, profilePhotos } from "@yasakia/db";
import { InvalidImageError, MAX_PHOTO_BYTES, normalisePhoto, PHOTO_TYPES, photoModeration, type PhotoType, verifyUpload } from "@yasakia/media";
import { and, asc, eq, lt, ne, sql } from "drizzle-orm";

import { photoAccess, relationshipFacts } from "./access";
import { HttpError, refuse } from "./http";
import { mediaSecret, mediaStorage, signPhotoUpload, signPhotoUrl } from "./media";
import { queuePhotoCheck } from "./photo-check";
import { photoRules } from "./rule-sets";

/**
 * Profile photos, from the signed upload to the signed view (docs/ARCHITECTURE.md, "Photos"):
 *
 * 1. `POST /api/me/photos` declares the type and size → a row UPLOADING and a signed upload URL (300 s, this photo only).
 * 2. The phone PUTs the bytes to that URL; the API checks the signature, the type and the size, and keeps them under a
 *    staging key. (Bunny Storage has no pre-signed upload: its key opens the whole zone, so it never leaves the server.)
 * 3. `PUT /api/me/photos/{id}/complete` reads them back, checks they are the declared picture, re-encodes them (JPEG,
 *    orientation applied, metadata — GPS included — stripped), computes width, height and blurhash, stores the result
 *    under the photo's key → PENDING → `PhotoModeration.review()` (V1: approved automatically).
 * 4. `GET /api/photos/{id}?w=` evaluates who asks (lib/access.ts) and only then signs a 300-second URL.
 */

/** Where the original bytes wait between the upload and the completion. */
export const stagingKey = (accountId: string, photoId: string, type: string) => `uploads/${accountId}/${photoId}.${PHOTO_TYPES[type as PhotoType] ?? "bin"}`;
const finalKey = (accountId: string, photoId: string) => `photos/${accountId}/${photoId}.jpg`;

/** What the owner sees of a photo — never a URL (that is `GET /api/photos/{id}`). */
function ownView(row: typeof profilePhotos.$inferSelect) {
  return {
    id: row.id,
    status: row.moderationStatus,
    position: row.position,
    width: row.width,
    height: row.height,
    blurhash: row.blurhash,
    createdAt: row.createdAt,
  };
}

export async function listOwnPhotos(accountId: string) {
  const rows = await db
    .select()
    .from(profilePhotos)
    .where(and(eq(profilePhotos.accountId, accountId), ne(profilePhotos.moderationStatus, "UPLOADING")))
    .orderBy(asc(profilePhotos.position), asc(profilePhotos.createdAt));
  return rows.map(ownView);
}

export async function createPhotoUpload(accountId: string, input: { contentType: PhotoType; bytes: number }) {
  const { params: rules } = await photoRules();
  const created = await db.transaction(async (tx) => {
    // Serialise the account's uploads so two at once cannot pass the count together.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`photos:${accountId}`}))`);
    const [{ count, last }] = await tx
      .select({ count: sql<number>`count(*) filter (where ${profilePhotos.moderationStatus} <> 'REJECTED')::int`, last: sql<number>`coalesce(max(${profilePhotos.position}), -1)::int` })
      .from(profilePhotos)
      .where(eq(profilePhotos.accountId, accountId));
    if (count >= rules.maxPhotos) throw refuse(409, "TOO_MANY_PHOTOS", `A profile holds ${rules.maxPhotos} photos at most`, { max: rules.maxPhotos });
    const id = crypto.randomUUID();
    const [row] = await tx
      .insert(profilePhotos)
      .values({ id, accountId, storageKey: finalKey(accountId, id), mimeType: input.contentType, bytes: input.bytes, position: last + 1, uploadExpiresAt: new Date(Date.now() + 300_000) })
      .returning();
    return row;
  });
  const upload = signPhotoUpload(created.id);
  return {
    photo: ownView(created),
    upload: { url: upload.url, method: "PUT" as const, headers: { "Content-Type": created.mimeType }, maxBytes: created.bytes, expiresAt: upload.expiresAt.toISOString() },
  };
}

/** Reads a request body up to `max` bytes (413 beyond). */
async function readLimited(body: ReadableStream<Uint8Array> | null, max: number): Promise<Buffer> {
  if (!body) throw refuse(400, "EMPTY_UPLOAD", "No bytes were sent");
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw refuse(413, "UPLOAD_TOO_LARGE", "Larger than the declared size", { maxBytes: max });
    }
    chunks.push(value);
  }
  if (total === 0) throw refuse(400, "EMPTY_UPLOAD", "No bytes were sent");
  return Buffer.concat(chunks);
}

/** The signed upload target: the signature is the authorisation (it names one photo and expires in 300 s). */
export async function receiveUpload(photoId: string, query: { expires: string | null; signature: string | null }, req: Request): Promise<void> {
  const expires = Number(query.expires);
  if (!query.signature || !verifyUpload({ photoId, expires, signature: query.signature, secret: mediaSecret() })) {
    throw refuse(403, "UPLOAD_SIGNATURE", "This upload URL is not valid (expired or altered)");
  }
  const [row] = await db.select().from(profilePhotos).where(eq(profilePhotos.id, photoId)).limit(1);
  if (!row || row.moderationStatus !== "UPLOADING" || row.uploadExpiresAt.getTime() < Date.now() - 60_000) throw refuse(404, "NOT_FOUND", "Not found");
  const type = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== row.mimeType) throw refuse(415, "UPLOAD_TYPE", `Send the bytes as ${row.mimeType}, as declared`);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > row.bytes) throw refuse(413, "UPLOAD_TOO_LARGE", "Larger than the declared size", { maxBytes: row.bytes });
  const bytes = await readLimited(req.body, Math.min(row.bytes, MAX_PHOTO_BYTES));
  await mediaStorage().put(stagingKey(row.accountId, row.id, row.mimeType), bytes, row.mimeType);
}

export async function completePhoto(accountId: string, photoId: string) {
  const [row] = await db
    .select()
    .from(profilePhotos)
    .where(and(eq(profilePhotos.id, photoId), eq(profilePhotos.accountId, accountId)))
    .limit(1);
  if (!row) throw refuse(404, "NOT_FOUND", "Not found");
  if (row.moderationStatus !== "UPLOADING") return ownView(row); // completing twice changes nothing
  const storage = mediaStorage();
  const staging = stagingKey(accountId, photoId, row.mimeType);
  const original = await storage.get(staging);
  if (!original) throw refuse(409, "UPLOAD_MISSING", "The bytes have not arrived — upload them to the signed URL first");
  let photo;
  try {
    photo = await normalisePhoto(original, row.mimeType);
  } catch (error) {
    if (error instanceof InvalidImageError) {
      await storage.delete(staging);
      await db.delete(profilePhotos).where(eq(profilePhotos.id, photoId));
      throw refuse(422, "INVALID_IMAGE", error.message);
    }
    throw error;
  }
  await storage.put(row.storageKey, photo.body, photo.mimeType);
  await storage.delete(staging);
  await db
    .update(profilePhotos)
    .set({ moderationStatus: "PENDING", mimeType: photo.mimeType, bytes: photo.body.length, width: photo.width, height: photo.height, blurhash: photo.blurhash, completedAt: new Date() })
    .where(eq(profilePhotos.id, photoId));
  const verdict = await photoModeration(process.env.MEDIA_PHOTO_MODERATION).review({ id: photoId, accountId, width: photo.width, height: photo.height, body: photo.body });
  const [reviewed] = await db
    .update(profilePhotos)
    .set({ moderationStatus: verdict, reviewedAt: verdict === "PENDING" ? null : new Date() })
    .where(eq(profilePhotos.id, photoId))
    .returning();
  // The set changed: Orazaka checks it again (the screen shows « checking » and asks until it is done). Never blocks the upload.
  if (verdict === "APPROVED") await queuePhotoCheck(accountId).catch((error) => console.error("photos: could not queue the check:", (error as Error).message));
  return ownView(reviewed);
}

/** The new order: exactly the account's photos, each once. */
export async function reorderPhotos(accountId: string, order: string[]) {
  const rows = await db
    .select({ id: profilePhotos.id })
    .from(profilePhotos)
    .where(and(eq(profilePhotos.accountId, accountId), ne(profilePhotos.moderationStatus, "UPLOADING")));
  const ids = new Set(rows.map((r) => r.id));
  if (order.length !== ids.size || new Set(order).size !== order.length || !order.every((id) => ids.has(id))) {
    throw refuse(400, "ORDER_MISMATCH", "The order must list each of your photos exactly once");
  }
  await db.transaction(async (tx) => {
    for (const [position, id] of order.entries()) await tx.update(profilePhotos).set({ position }).where(eq(profilePhotos.id, id));
  });
  return listOwnPhotos(accountId);
}

/** Removes a photo: its bytes first (a storage outage answers 503 and the photo stays), then the row. */
export async function deletePhoto(accountId: string, photoId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(profilePhotos)
    .where(and(eq(profilePhotos.id, photoId), eq(profilePhotos.accountId, accountId)))
    .limit(1);
  if (!row) throw refuse(404, "NOT_FOUND", "Not found");
  const storage = mediaStorage();
  try {
    await storage.delete(row.storageKey);
    await storage.delete(stagingKey(accountId, photoId, row.mimeType));
  } catch (error) {
    console.error("photos: storage delete failed", error);
    throw new HttpError(503, "The photo could not be removed from storage — try again", { code: "STORAGE_UNAVAILABLE" }, { "Retry-After": "10" });
  }
  await db.delete(profilePhotos).where(eq(profilePhotos.id, photoId));
  await queuePhotoCheck(accountId).catch(() => undefined); // the remaining set is checked again (409 NO_PHOTOS when none is left)
}

/** A signed URL for a viewer — after the access rule; anyone it refuses gets a 404 (the photo does not exist for them). */
export async function viewPhoto(viewerId: string, photoId: string, width: number | null) {
  const [row] = await db
    .select({ photo: profilePhotos, ownerStatus: accounts.status })
    .from(profilePhotos)
    .innerJoin(accounts, eq(accounts.id, profilePhotos.accountId))
    .where(eq(profilePhotos.id, photoId))
    .limit(1);
  if (!row) throw refuse(404, "NOT_FOUND", "Not found");
  const facts = viewerId === row.photo.accountId ? { blocked: false, inCurrentBatch: false, liveIntro: false } : await relationshipFacts(viewerId, row.photo.accountId);
  const access = photoAccess({ viewerId, ownerId: row.photo.accountId, ownerStatus: row.ownerStatus, moderationStatus: row.photo.moderationStatus, ...facts });
  if (!access.allowed) throw refuse(404, "NOT_FOUND", "Not found");
  const signed = signPhotoUrl(row.photo.storageKey, width);
  return { id: row.photo.id, url: signed.url, width: signed.width, expiresAt: signed.expiresAt, blurhash: row.photo.blurhash, aspectRatio: row.photo.width && row.photo.height ? row.photo.width / row.photo.height : null };
}

/** Upload rows whose URL expired without bytes (the background loop): their staging bytes, then the rows. */
export async function sweepAbandonedUploads(now = new Date()): Promise<number> {
  const rows = await db
    .select()
    .from(profilePhotos)
    .where(and(eq(profilePhotos.moderationStatus, "UPLOADING"), lt(profilePhotos.uploadExpiresAt, new Date(now.getTime() - 3_600_000))))
    .limit(100);
  for (const row of rows) {
    await mediaStorage()
      .delete(stagingKey(row.accountId, row.id, row.mimeType))
      .catch(() => undefined);
    await db.delete(profilePhotos).where(eq(profilePhotos.id, row.id));
  }
  return rows.length;
}
