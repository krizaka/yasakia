import { z } from "zod";

/**
 * The verdict of Orazaka's `profile-photo-check` Studio (the pack of krizaka/orazaka-packs): **codes**, never words and
 * never a number that pretends to precision — Yasakia words them, in the person's language and register. The face vectors
 * never leave the engine's worker; nothing here could hold one.
 */

export const PhotoKind = z.enum(["FACE", "GROUP", "NO_FACE"]);
export type PhotoKind = z.infer<typeof PhotoKind>;

/** Every code the pack may answer. A code outside this list is a contract change, not something to guess at. */
export const PHOTO_CODES = ["TOO_FEW_PHOTOS", "TOO_MANY_PHOTOS", "TOO_FEW_FACE_PHOTOS", "FACE_MISMATCH", "MINOR_LIKELY", "TEXT_OR_CONTACT", "SCREENSHOT", "UNVERIFIED", "GROUP_PHOTO"] as const;
export const PhotoCode = z.enum(PHOTO_CODES);
export type PhotoCode = z.infer<typeof PhotoCode>;

export const PhotoCheckReport = z.object({
  rulesetId: z.string(),
  rulesetVersion: z.string(),
  rulesetRevision: z.number().int(),
  photos: z.array(
    z.object({
      index: z.number().int().min(0),
      kind: PhotoKind,
      faceCount: z.number().int().min(0),
      findings: z.array(z.object({ code: PhotoCode, severity: z.enum(["BLOCK", "INFO"]) })),
    }),
  ),
  identity: z.object({ status: z.enum(["CONSISTENT", "MISMATCH", "NOT_COMPARABLE"]), compared: z.number().int().min(0) }),
  counts: z.object({ photos: z.number().int(), facePhotos: z.number().int(), required: z.object({ minPhotos: z.number().int(), maxPhotos: z.number().int(), minFacePhotos: z.number().int() }) }),
  passes: z.boolean(),
  blockers: z.array(z.object({ code: PhotoCode, photos: z.array(z.number().int().min(0)) })),
  limits: z.array(z.string()),
});
export type PhotoCheckReport = z.infer<typeof PhotoCheckReport>;

export interface PhotoCheckCounts {
  minPhotos: number;
  maxPhotos: number;
  minFacePhotos: number;
}

export interface PhotoCheckInput {
  /** The photos in the order of the profile; each a JPEG thumbnail (about 512 px), never the stored original. */
  photos: readonly Buffer[];
  counts: PhotoCheckCounts;
  signal?: AbortSignal;
}

export interface PhotoCheckResult {
  /** The engine's id of the Studio run — the proof of use, found in Orazaka's logs. */
  runId: string;
  report: PhotoCheckReport;
  ms: number;
}
