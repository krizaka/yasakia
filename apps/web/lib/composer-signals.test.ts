import { describe, expect, it } from "vitest";

import { type AuthenticityParams,behaviourOf } from "./authenticity-rules";
import { ComposerTracker } from "./composer-signals";

const params: AuthenticityParams = { minWords: 12, pasteRatio: 0.8, fastCharsPerSecond: 12, minTypedShare: 0.7 };

describe("ComposerTracker — counters only", () => {
  it("measures nothing until the composer is used", () => {
    expect(new ComposerTracker().snapshot(1000)).toBeUndefined();
  });

  it("a message typed by hand: characters typed, a few deletions, a human time", () => {
    const t = new ComposerTracker();
    let now = 0;
    for (let i = 0; i < 60; i++) t.input("insertText", 1, (now += 180));
    for (let i = 0; i < 3; i++) t.input("deleteContentBackward", 0, (now += 150));
    for (let i = 0; i < 20; i++) t.input("insertText", 1, (now += 170));
    const s = t.snapshot(now + 400)!;
    expect(s).toMatchObject({ typedChars: 80, pastedChars: 0, pasteEvents: 0, deletions: 3 });
    expect(s.typedMs).toBeGreaterThan(14_000);
    expect(behaviourOf(s, 80, params)).toBe("TYPED");
  });

  it("a pasted message: the characters came in one paste, almost no time", () => {
    const t = new ComposerTracker();
    t.input("insertFromPaste", 220, 5000);
    const s = t.snapshot(5600)!;
    expect(s).toEqual({ typedMs: 600, typedChars: 0, pastedChars: 220, pasteEvents: 1, deletions: 0 });
    expect(behaviourOf(s, 220, params)).toBe("PASTED");
  });

  it("a drop is a paste; a composition (mobile keyboards) is typing; the sender's reset starts over", () => {
    const t = new ComposerTracker();
    t.input("insertFromDrop", 40, 0);
    t.input("insertCompositionText", 3, 100);
    expect(t.snapshot(200)).toMatchObject({ pastedChars: 40, typedChars: 3, pasteEvents: 1 });
    t.reset();
    expect(t.snapshot(300)).toBeUndefined();
  });

  it("keeps no keystroke, no text, no series: the snapshot has five numbers and nothing else", () => {
    const t = new ComposerTracker();
    t.input("insertText", 1, 10);
    expect(Object.keys(t.snapshot(20)!).sort()).toEqual(["deletions", "pasteEvents", "pastedChars", "typedChars", "typedMs"]);
  });
});
