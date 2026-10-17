/**
 * The introduction's rules, pure: one row per pair (`account_a` < `account_b`), open for the MATCHING rule set's
 * `introDays`, continued when both say so, faded when time runs out, closed by a block, a report or a deletion.
 */

/** The `intro_state` enum. */
export const IntroState = { Open: "OPEN", Continued: "CONTINUED", Faded: "FADED", Closed: "CLOSED" } as const;
export type IntroState = (typeof IntroState)[keyof typeof IntroState];

export type Side = "A" | "B";

export const orderedPair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

export function sideOf(intro: { accountA: string; accountB: string }, me: string): Side | null {
  return intro.accountA === me ? "A" : intro.accountB === me ? "B" : null;
}

interface Live {
  state: string;
  expiresAt: Date;
  frozenAt: Date | null;
}

/** Why nobody may write now, or null. A continued intro has no end. */
export function writeRefusal(intro: Live, now: Date): "INTRO_CLOSED" | "INTRO_FROZEN" | null {
  if (intro.state === IntroState.Continued) return intro.frozenAt ? "INTRO_FROZEN" : null;
  if (intro.state !== IntroState.Open || now >= intro.expiresAt) return "INTRO_CLOSED";
  return intro.frozenAt ? "INTRO_FROZEN" : null;
}

interface Continuable extends Live {
  continuedByAAt: Date | null;
  continuedByBAt: Date | null;
}

export function continueRefusal(intro: Continuable, side: Side, now: Date): "INTRO_CLOSED" | "INTRO_FROZEN" | "ALREADY_CONTINUED" | null {
  if (intro.state !== IntroState.Open) return intro.state === IntroState.Continued ? "ALREADY_CONTINUED" : "INTRO_CLOSED";
  const refused = writeRefusal(intro, now);
  if (refused) return refused;
  return (side === "A" ? intro.continuedByAAt : intro.continuedByBAt) ? "ALREADY_CONTINUED" : null;
}

/** One more « continue »: the intro is CONTINUED once both said it. */
export function afterContinue(intro: Continuable, side: Side, now: Date): { continuedByAAt: Date | null; continuedByBAt: Date | null; state: IntroState } {
  const continuedByAAt = side === "A" ? now : intro.continuedByAAt;
  const continuedByBAt = side === "B" ? now : intro.continuedByBAt;
  return { continuedByAAt, continuedByBAt, state: continuedByAAt && continuedByBAt ? IntroState.Continued : IntroState.Open };
}
