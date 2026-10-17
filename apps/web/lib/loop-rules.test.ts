import { describe, expect, it } from "vitest";

import { allDecided, BatchStatus, DEBRIEF_QUESTIONS, DebriefAnswers, Decision, decisionRefusal } from "./batch-rules";
import { afterContinue, continueRefusal, IntroState, orderedPair, sideOf, writeRefusal } from "./intro-rules";

const now = new Date("2026-10-17T12:00:00Z");
const later = new Date("2026-10-20T12:00:00Z");
const open = { status: BatchStatus.Open, expiresAt: later, decision: null, withdrawn: false };

describe("answering a batch — interested, pass, or tell me more (once)", () => {
  it("lets each person of an open batch be answered", () => {
    for (const d of Object.values(Decision)) expect(decisionRefusal(open, d, now)).toBeNull();
  });
  it("refuses a closed or expired batch, someone withdrawn, and a second answer", () => {
    expect(decisionRefusal({ ...open, status: BatchStatus.DebriefDue }, Decision.Pass, now)).toEqual({ status: 409, code: "BATCH_CLOSED" });
    expect(decisionRefusal({ ...open, expiresAt: now }, Decision.Pass, now)).toEqual({ status: 409, code: "BATCH_EXPIRED" });
    expect(decisionRefusal({ ...open, withdrawn: true }, Decision.Pass, now)).toEqual({ status: 404, code: "NOT_FOUND" });
    expect(decisionRefusal({ ...open, decision: Decision.Interested }, Decision.Pass, now)).toEqual({ status: 409, code: "ALREADY_DECIDED" });
    expect(decisionRefusal({ ...open, decision: Decision.TellMeMore }, Decision.TellMeMore, now)).toEqual({ status: 409, code: "ALREADY_DECIDED" });
  });
  it("lets « tell me more » become interested or pass", () => {
    expect(decisionRefusal({ ...open, decision: Decision.TellMeMore }, Decision.Interested, now)).toBeNull();
  });
  it("is answered when every person still in it is interested or passed", () => {
    expect(allDecided([{ decision: Decision.Interested, withdrawn: false }, { decision: Decision.Pass, withdrawn: false }])).toBe(true);
    expect(allDecided([{ decision: Decision.Interested, withdrawn: false }, { decision: Decision.TellMeMore, withdrawn: false }])).toBe(false);
    expect(allDecided([{ decision: Decision.Interested, withdrawn: false }, { decision: null, withdrawn: true }])).toBe(true);
    expect(allDecided([{ decision: null, withdrawn: false }])).toBe(false);
  });
});

describe("the debrief — three questions, chips, a few words if you like", () => {
  const answers = DEBRIEF_QUESTIONS.map((q) => ({ questionId: q.id, chips: [q.chips[0]] }));
  it("accepts one answer per question, from its own chips", () => {
    expect(DebriefAnswers.safeParse(answers).success).toBe(true);
    expect(DebriefAnswers.safeParse([...answers.slice(0, 2), { ...answers[2], text: "Plus près de chez moi." }]).success).toBe(true);
  });
  it("refuses a missing or repeated question, a chip of another question, too many chips", () => {
    expect(DebriefAnswers.safeParse(answers.slice(0, 2)).success).toBe(false);
    expect(DebriefAnswers.safeParse([answers[0], answers[0], answers[2]]).success).toBe(false);
    expect(DebriefAnswers.safeParse([{ ...answers[0], chips: ["closer"] }, answers[1], answers[2]]).success).toBe(false);
    const q = DEBRIEF_QUESTIONS[0];
    expect(DebriefAnswers.safeParse([{ questionId: q.id, chips: [...q.chips] }, answers[1], answers[2]]).success).toBe(false);
  });
});

describe("an introduction — seven days, two people, continue both or let it fade", () => {
  it("stores a pair once, in order, and knows each side", () => {
    expect(orderedPair("b", "a")).toEqual(["a", "b"]);
    const intro = { accountA: "a", accountB: "b" };
    expect(sideOf(intro, "a")).toBe("A");
    expect(sideOf(intro, "b")).toBe("B");
    expect(sideOf(intro, "c")).toBeNull();
  });
  it("can be written in while open or continued, never once closed, faded, frozen or past its time", () => {
    const live = { state: IntroState.Open, expiresAt: later, frozenAt: null };
    expect(writeRefusal(live, now)).toBeNull();
    expect(writeRefusal({ ...live, state: IntroState.Continued, expiresAt: now }, now)).toBeNull();
    expect(writeRefusal({ ...live, expiresAt: now }, now)).toBe("INTRO_CLOSED");
    expect(writeRefusal({ ...live, state: IntroState.Faded }, now)).toBe("INTRO_CLOSED");
    expect(writeRefusal({ ...live, state: IntroState.Closed }, now)).toBe("INTRO_CLOSED");
    expect(writeRefusal({ ...live, frozenAt: now }, now)).toBe("INTRO_FROZEN");
  });
  it("continues when both said so; one alone waits for the other", () => {
    const intro = { state: IntroState.Open, expiresAt: later, frozenAt: null, continuedByAAt: null, continuedByBAt: null };
    expect(continueRefusal(intro, "A", now)).toBeNull();
    const one = afterContinue(intro, "A", now);
    expect(one).toEqual({ continuedByAAt: now, continuedByBAt: null, state: IntroState.Open });
    expect(continueRefusal({ ...intro, ...one }, "A", now)).toBe("ALREADY_CONTINUED");
    expect(afterContinue({ ...intro, ...one }, "B", now)).toEqual({ continuedByAAt: now, continuedByBAt: now, state: IntroState.Continued });
    expect(continueRefusal({ ...intro, state: IntroState.Faded }, "B", now)).toBe("INTRO_CLOSED");
  });
});
