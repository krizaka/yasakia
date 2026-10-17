import { z } from "zod";

/**
 * Orazaka's reading of one message's text (Studio `message-authenticity`): does it read as written by a person, or as machine
 * text? AI-text detectors are unreliable — above all on short texts and on non-native or French writing — so the engine answers
 * a **coarse level, never a score**, and `UNAVAILABLE` whenever it should not guess (unknown language, text too short).
 */

export const DetectorLevel = z.enum(["LOW", "MID", "HIGH", "UNAVAILABLE"]);
export type DetectorLevel = z.infer<typeof DetectorLevel>;

export const MessageJudgeReport = z
  .object({
    detector: DetectorLevel,
    language: z.enum(["en", "fr", "other"]),
    rulesetVersion: z.string(),
    limits: z.array(z.string()),
  })
  .strict();
export type MessageJudgeReport = z.infer<typeof MessageJudgeReport>;

export interface MessageJudgeInput {
  text: string;
  /** The language of the person's account (a hint; the engine reads the text's own). */
  locale: "en" | "fr";
  signal?: AbortSignal;
}

export interface MessageJudgeResult {
  /** The engine's id of the Studio run — the proof of use, found in Orazaka's logs. */
  runId: string;
  report: MessageJudgeReport;
  ms: number;
}
