import { type AiProvider, AiUnavailableError } from "@yasakia/ai";
import { db, introMedia, introMessages, intros } from "@yasakia/db";
import { checkThumbnail, InvalidImageError, limitRefusal, type MediaLimits,MediaRefusal, type MessageMediaKind, normalisePhoto, processMedia } from "@yasakia/media";
import { addSeconds } from "date-fns";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";

import { HttpError, refuse } from "./http";
import { decisionRecipients, mediaAccess, MediaStatus, MessageKind } from "./intro-media-rules";
import { sideOf, writeRefusal } from "./intro-rules";
import { mediaStorage, prepareMediaProcessing, signMessageMediaUrl, signMessageUpload, verifyMessageUpload } from "./media";
import { publishToAccount } from "./realtime";
import { mediaRules } from "./rule-sets";

/**
 * Media in a conversation: a photo, a short video, a voice message. Private on Bunny, never served raw (`GET …/media/{id}` signs
 * a 300-second URL after the access rule), within limits that are a rule set, **never edited** (the file is only made clean — metadata
 * removed — and measured), and **judged before the other person can see it**: Orazaka's `media-safety` looks at the picture (or frames
 * of the video, or the words of the voice message) and fails closed — a check that cannot decide holds the media, it never approves it.
 * Its life is the conversation's: faded, closed or frozen, nobody opens it and its bytes are deleted.
 *
 * `POST …/media` declares the message and answers a signed upload URL → the PUT of the bytes → `PUT …/complete` cleans, measures, stores
 * and queues the safety check → the loop (`reviewNextMedia`) decides.
 */

const stagingKey = (introId: string, messageId: string) => `messages/${introId}/${messageId}.upload`;
const finalKey = (introId: string, messageId: string, ext: string) => `messages/${introId}/${messageId}.${ext}`;
const posterKey = (introId: string, messageId: string) => `messages/${introId}/${messageId}.poster.jpg`;

/** How many times a safety check may fail to decide before the media is left for a person (it stays held, never approved). */
const Verdict = { Approved: "APPROVED", Rejected: "REJECTED" } as const; // the media-safety verdicts this module acts on (the third, UNREADABLE, holds)

const MAX_REVIEW_ATTEMPTS = 6; // @fixed: ~ an hour of retries at the loop's pace, then it waits for an operator

const DECLARED_TYPES: Record<MessageMediaKind, readonly string[]> = {
  PHOTO: ["image/jpeg", "image/png", "image/webp"],
  VIDEO: ["video/mp4", "video/webm", "video/quicktime"],
  AUDIO: ["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"],
};

export interface MediaView {
  kind: MessageMediaKind;
  status: MediaStatus;
  durationMs: number | null;
  /** 64 peaks (0 to 100) for a voice message — the waveform; never computed in the browser. */
  waveform: number[] | null;
  /** Why it was refused, as codes (the screen words them) — only the sender is told. */
  codes: string[];
}

async function mineLive(me: string, introId: string, now: Date) {
  const [intro] = await db.select().from(intros).where(and(eq(intros.id, introId), or(eq(intros.accountA, me), eq(intros.accountB, me)))).limit(1);
  if (!intro) throw refuse(404, "NOT_FOUND", "Not found");
  const refused = writeRefusal(intro, now);
  if (refused) throw refuse(409, refused, "This introduction is not open for messages");
  return { intro, side: sideOf(intro, me) as "A" | "B" };
}

function limitsError(kind: MessageMediaKind, media: { bytes: number; durationMs?: number }, limits: MediaLimits): HttpError | null {
  const refusal = limitRefusal(kind, media, limits);
  return refusal ? refuse(413, refusal.code, refusal.code === "MEDIA_TOO_LARGE" ? "This file is larger than allowed" : "This is longer than allowed", { max: refusal.max, kind }) : null;
}

/**
 * Declares a media message: its kind, type, size and (for sound and video, as the phone knows it) length. The message exists for its
 * sender only until the safety check has approved it. Idempotent per `clientId`.
 */
export async function startMediaMessage(
  me: string,
  introId: string,
  input: { kind: MessageMediaKind; contentType: string; bytes: number; durationMs?: number; clientId: string },
  now: Date,
): Promise<{ messageId: string; upload: { url: string; method: "PUT"; headers: Record<string, string>; maxBytes: number; expiresAt: string }; limits: MediaLimits }> {
  const { intro } = await mineLive(me, introId, now);
  const { params: limits } = await mediaRules();
  if (!DECLARED_TYPES[input.kind].includes(input.contentType)) throw refuse(415, "MEDIA_TYPE", `A ${input.kind.toLowerCase()} must be ${DECLARED_TYPES[input.kind].join(", ")}`);
  const tooBig = limitsError(input.kind, { bytes: input.bytes, durationMs: input.durationMs }, limits);
  if (tooBig) throw tooBig;
  const messageId = crypto.randomUUID();
  const created = await db.transaction(async (tx) => {
    const [message] = await tx
      .insert(introMessages)
      .values({ id: messageId, introId: intro.id, senderId: me, body: "", kind: input.kind, clientId: input.clientId, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: introMessages.id });
    if (!message) return null;
    await tx.insert(introMedia).values({ messageId, kind: input.kind, status: MediaStatus.Uploading, storageKey: finalKey(intro.id, messageId, "pending"), mimeType: input.contentType, bytes: input.bytes, uploadExpiresAt: addSeconds(now, 300) });
    return message.id;
  });
  if (!created) throw refuse(409, "DUPLICATE", "This message was already started");
  const upload = signMessageUpload(messageId);
  return { messageId, upload: { url: upload.url, method: "PUT", headers: { "Content-Type": input.contentType }, maxBytes: input.bytes, expiresAt: upload.expiresAt.toISOString() }, limits };
}

/** The signed upload target: the signature is the authorisation (one message, 300 s). The bytes wait under a staging key. */
export async function receiveMediaUpload(messageId: string, query: { expires: string | null; signature: string | null }, req: Request): Promise<void> {
  const expires = Number(query.expires);
  if (!query.signature || !verifyMessageUpload(messageId, expires, query.signature)) throw refuse(403, "UPLOAD_SIGNATURE", "This upload URL is not valid (expired or altered)");
  const [row] = await db
    .select({ media: introMedia, introId: introMessages.introId })
    .from(introMedia)
    .innerJoin(introMessages, eq(introMessages.id, introMedia.messageId))
    .where(eq(introMedia.messageId, messageId))
    .limit(1);
  if (!row || row.media.status !== MediaStatus.Uploading) throw refuse(404, "NOT_FOUND", "Not found");
  const type = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== row.media.mimeType) throw refuse(415, "UPLOAD_TYPE", `Send the bytes as ${row.media.mimeType}, as declared`);
  const { params: limits } = await mediaRules();
  const max = Math.min(row.media.bytes, row.media.kind === MessageKind.Photo ? limits.photoMaxBytes : row.media.kind === MessageKind.Video ? limits.videoMaxBytes : limits.audioMaxBytes);
  if (Number(req.headers.get("content-length") ?? "0") > max) throw refuse(413, "MEDIA_TOO_LARGE", "Larger than the declared size", { max });
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = req.body?.getReader();
  if (!reader) throw refuse(400, "EMPTY_UPLOAD", "No bytes were sent");
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw refuse(413, "MEDIA_TOO_LARGE", "Larger than the declared size", { max });
    }
    chunks.push(value);
  }
  if (total === 0) throw refuse(400, "EMPTY_UPLOAD", "No bytes were sent");
  await mediaStorage().put(stagingKey(row.introId, messageId), Buffer.concat(chunks), row.media.mimeType);
}

/**
 * Completes an upload: the bytes are the declared kind of media, within the limits (the **measured** length decides), cleaned of
 * every metadata block and stored under the message's key; then the safety check is queued. Nothing is edited. A refusal deletes
 * the message — nothing half-made is left behind.
 */
export async function completeMediaMessage(me: string, introId: string, messageId: string, now: Date): Promise<MediaView> {
  const { intro } = await mineLive(me, introId, now);
  const [row] = await db
    .select({ media: introMedia, senderId: introMessages.senderId })
    .from(introMedia)
    .innerJoin(introMessages, eq(introMessages.id, introMedia.messageId))
    .where(and(eq(introMedia.messageId, messageId), eq(introMessages.introId, intro.id)))
    .limit(1);
  if (!row || row.senderId !== me) throw refuse(404, "NOT_FOUND", "Not found");
  if (row.media.status !== MediaStatus.Uploading) return view(row.media);
  const storage = mediaStorage();
  const staging = stagingKey(intro.id, messageId);
  const original = await storage.get(staging);
  prepareMediaProcessing();
  if (!original) throw refuse(409, "UPLOAD_MISSING", "The bytes have not arrived — upload them to the signed URL first");
  const { params: limits } = await mediaRules();
  const discard = async (error: HttpError) => {
    await storage.delete(staging).catch(() => undefined);
    await db.delete(introMessages).where(eq(introMessages.id, messageId));
    throw error;
  };
  const kind = row.media.kind as MessageMediaKind;
  const tooBig = limitsError(kind, { bytes: original.length }, limits);
  if (tooBig) return discard(tooBig);

  let body: Buffer;
  let mime: string;
  let ext: string;
  let durationMs: number | null = null;
  let waveform: number[] | null = null;
  let poster: Buffer | null = null;
  try {
    if (kind === MessageKind.Photo) {
      const photo = await normalisePhoto(original, row.media.mimeType);
      ({ body, mimeType: mime } = photo);
      ext = "jpg";
    } else {
      const processed = await processMedia(original, kind);
      const tooLong = limitsError(kind, { bytes: processed.body.length, durationMs: processed.durationMs }, limits);
      if (tooLong) return discard(tooLong);
      ({ body, mime, ext, durationMs, poster } = { body: processed.body, mime: processed.mime, ext: processed.ext, durationMs: processed.durationMs, poster: processed.poster });
      waveform = processed.peaks;
    }
  } catch (error) {
    if (error instanceof InvalidImageError || (error instanceof MediaRefusal && error.code !== "MEDIA_UNAVAILABLE")) return discard(refuse(422, error instanceof MediaRefusal ? error.code : "INVALID_IMAGE", error.message));
    if (error instanceof MediaRefusal) throw new HttpError(503, "Media cannot be processed right now — try again", { code: "MEDIA_UNAVAILABLE" }, { "Retry-After": "30" });
    throw error;
  }
  const key = finalKey(intro.id, messageId, ext);
  await storage.put(key, body, mime);
  if (poster) await storage.put(posterKey(intro.id, messageId), poster, "image/jpeg");
  await storage.delete(staging).catch(() => undefined);
  const [updated] = await db
    .update(introMedia)
    .set({ status: MediaStatus.Pending, storageKey: key, posterKey: poster ? posterKey(intro.id, messageId) : null, mimeType: mime, bytes: body.length, durationMs, waveform })
    .where(eq(introMedia.messageId, messageId))
    .returning();
  return view(updated);
}

function view(row: typeof introMedia.$inferSelect): MediaView {
  return { kind: row.kind as MessageMediaKind, status: row.status as MediaStatus, durationMs: row.durationMs, waveform: row.waveform, codes: row.status === MediaStatus.Rejected ? (row.moderationCodes ?? []) : [] };
}

/** The media view of each message of a thread for one reader (the other person's unapproved media do not exist for them). */
export async function mediaOf(messageIds: string[]): Promise<Map<string, typeof introMedia.$inferSelect>> {
  if (messageIds.length === 0) return new Map();
  const rows = await db.select().from(introMedia).where(inArray(introMedia.messageId, messageIds));
  return new Map(rows.map((r) => [r.messageId, r]));
}

export { view as mediaView };

/** A signed URL (and poster) for a reader — after the access rule; anyone it refuses gets a 404 (it does not exist for them). */
export async function viewMedia(viewerId: string, introId: string, messageId: string, now: Date): Promise<{ url: string; posterUrl: string | null; expiresAt: string; mimeType: string; kind: MessageMediaKind }> {
  const [row] = await db
    .select({ media: introMedia, senderId: introMessages.senderId, intro: intros })
    .from(introMedia)
    .innerJoin(introMessages, eq(introMessages.id, introMedia.messageId))
    .innerJoin(intros, eq(intros.id, introMessages.introId))
    .where(and(eq(introMedia.messageId, messageId), eq(intros.id, introId), or(eq(intros.accountA, viewerId), eq(intros.accountB, viewerId))))
    .limit(1);
  if (!row || row.media.status === MediaStatus.Uploading) throw refuse(404, "NOT_FOUND", "Not found");
  const access = mediaAccess({ viewerIsSender: row.senderId === viewerId, status: row.media.status as MediaStatus, introState: row.intro.state, frozen: row.intro.frozenAt !== null, expired: now >= row.intro.expiresAt });
  if (!access.allowed) throw refuse(404, "NOT_FOUND", "Not found");
  const signed = signMessageMediaUrl(row.media.storageKey);
  return { url: signed.url, posterUrl: row.media.posterKey ? signMessageMediaUrl(row.media.posterKey).url : null, expiresAt: signed.expiresAt, mimeType: row.media.mimeType, kind: row.media.kind as MessageMediaKind };
}

/** The safety check decided: the people concerned are told at once (ids only) and refetch their thread — the sender's « only you can see it » must not linger. */
async function announce(messageId: string, verdict: string): Promise<void> {
  const [row] = await db
    .select({ senderId: introMessages.senderId, introId: introMessages.introId, a: intros.accountA, b: intros.accountB })
    .from(introMessages)
    .innerJoin(intros, eq(intros.id, introMessages.introId))
    .where(eq(introMessages.id, messageId))
    .limit(1);
  if (!row) return;
  for (const account of decisionRecipients(verdict, { senderId: row.senderId, accountA: row.a, accountB: row.b })) await publishToAccount(account, { type: "intro.message", introId: row.introId, messageId });
}

/** Claims the oldest PENDING media that may be tried now (`FOR UPDATE SKIP LOCKED`, a try at a time per instance). */
async function claimNextReview(): Promise<(typeof introMedia.$inferSelect & { introId: string }) | null> {
  const res = await db.execute<{ message_id: string }>(sql`
    update intro_media set attempts = attempts + 1
    where message_id = (select message_id from intro_media where status = 'PENDING' and attempts < ${MAX_REVIEW_ATTEMPTS} and (reviewed_at is null or reviewed_at < now() - interval '15 seconds') order by created_at for update skip locked limit 1)
    returning message_id`);
  const id = res.rows[0]?.message_id;
  if (!id) return null;
  const [row] = await db.select({ media: introMedia, introId: introMessages.introId }).from(introMedia).innerJoin(introMessages, eq(introMessages.id, introMedia.messageId)).where(eq(introMedia.messageId, id)).limit(1);
  return row ? { ...row.media, introId: row.introId } : null;
}

/**
 * Judges the next waiting media with Orazaka. APPROVED → visible to the other person; REJECTED → its bytes are deleted and only the sender
 * learns why (codes); UNREADABLE or an engine out of reach → it stays held (never approved) and is tried again later. Returns whether one
 * was worked.
 */
export async function reviewNextMedia(ai: AiProvider): Promise<boolean> {
  const claimed = await claimNextReview();
  if (!claimed) return false;
  const storage = mediaStorage();
  try {
    prepareMediaProcessing();
    const bytes = await storage.get(claimed.storageKey);
    if (!bytes) {
      await db.update(introMedia).set({ status: MediaStatus.Gone, reviewedAt: sql`now()` }).where(eq(introMedia.messageId, claimed.messageId));
      return true;
    }
    const kind = claimed.kind as MessageMediaKind;
    let frames: Buffer[] = [];
    let audio: { bytes: Buffer; mime: string } | undefined;
    if (kind === MessageKind.Photo) frames = [await checkThumbnail(bytes)];
    else if (kind === MessageKind.Video) frames = (await processMedia(bytes, "VIDEO")).frames;
    else audio = { bytes, mime: claimed.mimeType };
    const result = await ai.moderateMedia({ frames, audio });
    console.log(`[media] review ${claimed.messageId} run=${result.runId} verdict=${result.report.verdict} ms=${result.ms}`);
    if (result.report.verdict === Verdict.Approved) {
      await db.update(introMedia).set({ status: MediaStatus.Approved, engineRunId: result.runId, reviewedAt: sql`now()` }).where(eq(introMedia.messageId, claimed.messageId));
      await announce(claimed.messageId, Verdict.Approved);
    } else if (result.report.verdict === Verdict.Rejected) {
      await storage.delete(claimed.storageKey).catch(() => undefined);
      if (claimed.posterKey) await storage.delete(claimed.posterKey).catch(() => undefined);
      await db.update(introMedia).set({ status: MediaStatus.Rejected, moderationCodes: result.report.blockers, engineRunId: result.runId, reviewedAt: sql`now()`, waveform: null }).where(eq(introMedia.messageId, claimed.messageId));
      await announce(claimed.messageId, Verdict.Rejected);
    } else {
      // Unreadable: held. Never approved; tried again a few seconds later, up to a few times.
      await db.update(introMedia).set({ engineRunId: result.runId, reviewedAt: sql`now()` }).where(eq(introMedia.messageId, claimed.messageId));
    }
  } catch (error) {
    console.error(`[media] review ${claimed.messageId} could not decide:`, error instanceof AiUnavailableError ? error.code : (error as Error).message);
    await db.update(introMedia).set({ reviewedAt: sql`now()` }).where(eq(introMedia.messageId, claimed.messageId));
  }
  return true;
}

export async function hasPendingMedia(): Promise<boolean> {
  const [row] = await db.select({ id: introMedia.messageId }).from(introMedia).where(and(eq(introMedia.status, MediaStatus.Pending), lt(introMedia.attempts, MAX_REVIEW_ATTEMPTS))).limit(1);
  return Boolean(row);
}

/**
 * The media's life is the conversation's: when an introduction is faded or closed, its files are deleted and the media are GONE; an
 * upload that never completed is swept. Every instance, idempotent.
 */
export async function sweepIntroMedia(): Promise<number> {
  const storage = mediaStorage();
  let removed = 0;
  const ended = await db.execute<{ message_id: string; storage_key: string; poster_key: string | null }>(sql`
    select m.message_id, m.storage_key, m.poster_key from intro_media m
    join intro_messages im on im.id = m.message_id join intros i on i.id = im.intro_id
    where m.status in ('PENDING', 'APPROVED') and (i.state in ('FADED', 'CLOSED') or (i.state = 'OPEN' and i.expires_at <= now()))
    limit 100`);
  for (const row of ended.rows) {
    await storage.delete(row.storage_key).catch(() => undefined);
    if (row.poster_key) await storage.delete(row.poster_key).catch(() => undefined);
    await db.update(introMedia).set({ status: MediaStatus.Gone, waveform: null }).where(eq(introMedia.messageId, row.message_id));
    removed += 1;
  }
  const abandoned = await db.execute<{ message_id: string; intro_id: string }>(sql`
    select m.message_id, im.intro_id from intro_media m join intro_messages im on im.id = m.message_id
    where m.status = 'UPLOADING' and m.upload_expires_at < now() - interval '1 hour' limit 100`);
  for (const row of abandoned.rows) {
    await storage.delete(stagingKey(row.intro_id, row.message_id)).catch(() => undefined);
    await db.delete(introMessages).where(eq(introMessages.id, row.message_id));
    removed += 1;
  }
  return removed;
}

/** The keys of every media file in the conversations an account is part of — for the purge when the account is deleted. */
export async function mediaKeysOfAccount(tx: Pick<typeof db, "execute">, accountId: string): Promise<string[]> {
  const res = await tx.execute<{ storage_key: string; poster_key: string | null; intro_id: string; message_id: string }>(sql`
    select m.storage_key, m.poster_key, im.intro_id, m.message_id from intro_media m
    join intro_messages im on im.id = m.message_id join intros i on i.id = im.intro_id
    where i.account_a = ${accountId} or i.account_b = ${accountId}`);
  return res.rows.flatMap((r) => [r.storage_key, ...(r.poster_key ? [r.poster_key] : []), stagingKey(r.intro_id, r.message_id)]);
}
