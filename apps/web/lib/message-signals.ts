import type { AiProvider, DetectorLevel } from "@yasakia/ai";
import { AiUnavailableError } from "@yasakia/ai";
import { db, introMessages, introMessageSignals } from "@yasakia/db";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { type AuthenticitySignal, type Detector, type MessageSignals, signalFor } from "./authenticity-rules";
import { authenticityRules } from "./rule-sets";

/**
 * The authenticity signal of intro messages: a signal, never a verdict, and **never a reason to hold a message back** — the
 * message is delivered at once, its signal arrives a moment later (or, if the engine is out of reach, from how it was typed alone).
 * Orazaka judges a message's text with a small classifier (coarse level, no score); the composer's counters say how it arrived;
 * `authenticity-rules.ts` puts the two in one of four words.
 */

/** A message just sent: its counters are kept (null when the client measured nothing); the signal is judged next. */
export async function recordPendingSignal(messageId: string, signals: MessageSignals | undefined): Promise<void> {
  await db
    .insert(introMessageSignals)
    .values({ messageId, typedMs: signals?.typedMs ?? null, typedChars: signals?.typedChars ?? null, pastedChars: signals?.pastedChars ?? null, pasteEvents: signals?.pasteEvents ?? null, deletions: signals?.deletions ?? null })
    .onConflictDoNothing();
}

function countersOf(row: { typedMs: number | null; typedChars: number | null; pastedChars: number | null; pasteEvents: number | null; deletions: number | null }): MessageSignals | undefined {
  if (row.typedMs === null || row.typedChars === null || row.pastedChars === null || row.pasteEvents === null || row.deletions === null) return undefined;
  return { typedMs: row.typedMs, typedChars: row.typedChars, pastedChars: row.pastedChars, pasteEvents: row.pasteEvents, deletions: row.deletions };
}

/** Writes the signal of a message from the text's level and the counters; first writer wins (idempotent). */
async function settle(messageId: string, detector: Detector, engineRunId: string | null): Promise<AuthenticitySignal | null> {
  const [row] = await db
    .select({ body: introMessages.body, signal: introMessageSignals.signal, typedMs: introMessageSignals.typedMs, typedChars: introMessageSignals.typedChars, pastedChars: introMessageSignals.pastedChars, pasteEvents: introMessageSignals.pasteEvents, deletions: introMessageSignals.deletions })
    .from(introMessageSignals)
    .innerJoin(introMessages, eq(introMessages.id, introMessageSignals.messageId))
    .where(eq(introMessageSignals.messageId, messageId))
    .limit(1);
  if (!row || row.signal) return (row?.signal as AuthenticitySignal | null) ?? null;
  const { version, params } = await authenticityRules();
  const signal = signalFor({ text: row.body, detector, signals: countersOf(row) }, params);
  await db
    .update(introMessageSignals)
    .set({ detector, signal, rulesVersion: version, engineRunId, judgedAt: sql`now()` })
    .where(and(eq(introMessageSignals.messageId, messageId), isNull(introMessageSignals.signal)));
  return signal;
}

/**
 * Judges one message with the engine. Never throws: whatever happens, the message already went through, and a signal that could
 * not be read from the text is made from how the message arrived alone (`UNAVAILABLE`).
 */
export async function judgeMessageSignal(ai: AiProvider, messageId: string, locale: "en" | "fr"): Promise<AuthenticitySignal | null> {
  const [row] = await db.select({ body: introMessages.body }).from(introMessages).where(eq(introMessages.id, messageId)).limit(1);
  if (!row) return null;
  try {
    const result = await ai.judgeMessage({ text: row.body, locale });
    console.log(`[signal] message ${messageId} run=${result.runId} ms=${result.ms}`);
    return await settle(messageId, result.report.detector as DetectorLevel, result.runId);
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) console.error("[signal] could not judge a message:", (error as Error).message);
    return settle(messageId, "UNAVAILABLE", null).catch(() => null);
  }
}

/** Messages whose signal was never judged (an instance died, no engine configured): given from how they arrived alone. */
export async function finalizeStaleSignals(minutes = 2): Promise<number> {
  const stale = await db
    .select({ id: introMessageSignals.messageId })
    .from(introMessageSignals)
    .where(and(isNull(introMessageSignals.signal), lt(introMessageSignals.createdAt, sql`now() - make_interval(mins => ${minutes})`)))
    .limit(200);
  for (const { id } of stale) await settle(id, "UNAVAILABLE", null);
  return stale.length;
}

/** The signal of each message (null while pending). */
export async function signalsOf(messageIds: string[]): Promise<Map<string, AuthenticitySignal | null>> {
  if (messageIds.length === 0) return new Map();
  const rows = await db.select({ id: introMessageSignals.messageId, signal: introMessageSignals.signal }).from(introMessageSignals).where(inArray(introMessageSignals.messageId, messageIds));
  return new Map(rows.map((r) => [r.id, r.signal as AuthenticitySignal | null]));
}
