import { z } from "zod";

/**
 * The authenticity signal of a message, pure. AI-text detectors are unreliable — above all on short texts and on non-native or
 * French writing — so the product shows a **signal, never a verdict**: four words, no number. Two independent kinds of sign are
 * combined, and the strongest word is given only when both agree:
 *
 * - **the text**, read by Orazaka's classifier, coarsely (`LOW · MID · HIGH · UNAVAILABLE` — the engine never hands out a score);
 * - **how the message arrived**, measured by the composer (counters only: how long it took to type, how many characters were typed
 *   and how many pasted, how many deletions) — often stronger than any text classifier.
 *
 * « Probably generated » therefore needs the text to read as machine **and** the message to have arrived pasted, or faster than a hand
 * types. A message is never blocked, whatever the signal.
 */

/** The bounds of the AUTHENTICITY rule set (versioned rows; the thresholds of the engine's classifier live in the pack's ruleset). */
export const AuthenticityParams = z
  .object({
    /** Under this many words the signal says « too short to judge ». */
    minWords: z.number().int().min(6).max(60),
    /** The share of a message's characters that arrived in a paste above which it counts as pasted. */
    pasteRatio: z.number().min(0.5).max(1),
    /** Typing faster than this (characters per second, with no paste) is faster than a hand. */
    fastCharsPerSecond: z.number().min(6).max(40),
    /** The share of characters typed above which a message counts as typed. */
    minTypedShare: z.number().min(0.5).max(1),
  })
  .strict();
export type AuthenticityParams = z.infer<typeof AuthenticityParams>;

/** What the composer measured — counters only; no keystroke, no timing series, no text. */
export const MessageSignals = z
  .object({
    typedMs: z.number().int().min(0).max(3_600_000),
    typedChars: z.number().int().min(0).max(5000),
    pastedChars: z.number().int().min(0).max(5000),
    pasteEvents: z.number().int().min(0).max(100),
    deletions: z.number().int().min(0).max(5000),
  })
  .strict();
export type MessageSignals = z.infer<typeof MessageSignals>;

export type Detector = "LOW" | "MID" | "HIGH" | "UNAVAILABLE";
export type Behaviour = "TYPED" | "PASTED" | "FAST" | "UNKNOWN";
export type AuthenticitySignal = "HAND" | "UNSURE" | "LIKELY_GENERATED" | "TOO_SHORT";

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** How the message arrived, from the composer's counters. */
export function behaviourOf(signals: MessageSignals | undefined, chars: number, params: AuthenticityParams): Behaviour {
  if (!signals || chars <= 0) return "UNKNOWN";
  const total = signals.typedChars + signals.pastedChars;
  if (total === 0) return "UNKNOWN";
  if (signals.pastedChars / total >= params.pasteRatio) return "PASTED";
  if (signals.typedChars / total >= params.minTypedShare) {
    const seconds = Math.max(signals.typedMs, 1) / 1000;
    return signals.typedChars / seconds > params.fastCharsPerSecond ? "FAST" : "TYPED";
  }
  return "UNKNOWN";
}

export function signalFor(input: { text: string; detector: Detector; signals: MessageSignals | undefined }, params: AuthenticityParams): AuthenticitySignal {
  if (wordCount(input.text) < params.minWords) return "TOO_SHORT";
  const behaviour = behaviourOf(input.signals, input.text.length, params);
  const arrivedOddly = behaviour === "PASTED" || behaviour === "FAST";
  if (input.detector === "HIGH" && arrivedOddly) return "LIKELY_GENERATED";
  if (behaviour === "TYPED") return input.detector === "HIGH" ? "UNSURE" : "HAND"; // typed, yet it reads as machine: only « uncertain »
  if (arrivedOddly) return "UNSURE";
  // No usable measure: only the text speaks, and only « nothing odd » is said out loud.
  if (behaviour === "UNKNOWN") return input.detector === "LOW" ? "HAND" : "UNSURE";
  return "UNSURE";
}
