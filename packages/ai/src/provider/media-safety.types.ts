import { z } from "zod";

/**
 * The verdict of Orazaka's `media-safety` Studio on a photo, the frames of a video or a voice message: **codes**, and a verdict that
 * fails closed — `UNREADABLE` (an answer nobody could read, nothing examined) is never `APPROVED`. A video is judged on the frames the
 * caller samples, a sound on its transcript: the report says so in `limits`.
 */

export const SAFETY_CODES = ["SEXUAL_CONTENT", "GRAPHIC_VIOLENCE", "MINOR_UNSAFE", "THREAT_OR_HARASSMENT", "SEXUAL_SPEECH", "HATE"] as const;
export const SafetyCode = z.enum(SAFETY_CODES);
export type SafetyCode = z.infer<typeof SafetyCode>;

export const MediaSafetyReport = z.object({
  rulesetId: z.string(),
  rulesetVersion: z.string(),
  rulesetRevision: z.number().int(),
  verdict: z.enum(["APPROVED", "REJECTED", "UNREADABLE"]),
  blockers: z.array(SafetyCode),
  findings: z.array(z.object({ code: SafetyCode, frame: z.number().int().min(0).nullable() })),
  examined: z.object({ frames: z.number().int().min(0), speech: z.boolean() }),
  unreadable: z.number().int().min(0),
  limits: z.array(z.string()),
});
export type MediaSafetyReport = z.infer<typeof MediaSafetyReport>;

export interface MediaSafetyInput {
  /** JPEG pictures to examine: the photo itself, or frames sampled from a video (at most eight). */
  frames: readonly Buffer[];
  /** A voice message to transcribe and judge on its words; absent for a picture or a video. */
  audio?: { bytes: Buffer; mime: string };
  signal?: AbortSignal;
}

export interface MediaSafetyResult {
  /** The engine's id of the Studio run — the proof of use. */
  runId: string;
  report: MediaSafetyReport;
  ms: number;
}
