import { z } from "zod";

/**
 * The batch's rules, pure: who may be answered, when a batch is answered, and the debrief's three questions. The texts
 * are messages (`batch.debrief.<question>.*`); here only ids.
 */

/** The `batch_status` enum. */
export const BatchStatus = { Open: "OPEN", DebriefDue: "DEBRIEF_DUE", Done: "DONE", Expired: "EXPIRED" } as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

/** The `batch_decision` enum: INTERESTED and PASS are final; TELL_ME_MORE opens what they look for, once. */
export const Decision = { Interested: "INTERESTED", Pass: "PASS", TellMeMore: "TELL_ME_MORE" } as const;
export type Decision = (typeof Decision)[keyof typeof Decision];
export const DECISIONS = Object.values(Decision);

const isFinal = (d: Decision | null): boolean => d === Decision.Interested || d === Decision.Pass;

export interface DecisionTarget {
  status: string;
  expiresAt: Date;
  decision: Decision | null;
  withdrawn: boolean;
}

/** Why this answer is refused, or null. */
export function decisionRefusal(target: DecisionTarget, decision: Decision, now: Date): { status: number; code: string } | null {
  if (target.withdrawn) return { status: 404, code: "NOT_FOUND" };
  if (target.status !== BatchStatus.Open) return { status: 409, code: "BATCH_CLOSED" };
  if (now >= target.expiresAt) return { status: 409, code: "BATCH_EXPIRED" };
  if (isFinal(target.decision) || (target.decision === Decision.TellMeMore && decision === Decision.TellMeMore)) return { status: 409, code: "ALREADY_DECIDED" };
  return null;
}

/** Every person still in the batch is answered (interested or passed): the debrief is due. */
export function allDecided(items: readonly { decision: Decision | null; withdrawn: boolean }[]): boolean {
  return items.filter((i) => !i.withdrawn).every((i) => isFinal(i.decision));
}

/** The debrief: three questions, each answered with its own chips (and a few words if the person likes). */
export const DEBRIEF_QUESTIONS = [
  { id: "rangTrue", chips: ["yes", "partly", "no"], max: 1 },
  { id: "mattered", chips: ["values", "humour", "rhythm", "distance", "intent"], max: 2 },
  { id: "next", chips: ["same", "closer", "different"], max: 1 },
] as const;

export const DebriefAnswers = z
  .array(z.object({ questionId: z.string(), chips: z.array(z.string()).min(1), text: z.string().trim().max(500).optional() }).strict())
  .length(DEBRIEF_QUESTIONS.length)
  .superRefine((answers, ctx) => {
    const seen = new Set<string>();
    for (const [i, a] of answers.entries()) {
      const q = DEBRIEF_QUESTIONS.find((d) => d.id === a.questionId);
      const valid = q && !seen.has(a.questionId) && a.chips.length <= q.max && new Set(a.chips).size === a.chips.length && a.chips.every((c) => (q.chips as readonly string[]).includes(c));
      if (!valid) ctx.addIssue({ code: "custom", path: [i], message: "invalid answer" });
      seen.add(a.questionId);
    }
  });
export type DebriefAnswers = z.infer<typeof DebriefAnswers>;
