import { describe, expect, it } from "vitest";

import { type AuthenticityParams, behaviourOf, type MessageSignals, signalFor } from "./authenticity-rules";

const params: AuthenticityParams = { minWords: 12, pasteRatio: 0.8, fastCharsPerSecond: 12, minTypedShare: 0.7 };
const text = "Salut ! J’ai vu que tu aimes la randonnée aussi, tu connais le sentier derrière le mont Royal ?";
const typed: MessageSignals = { typedMs: 15_000, typedChars: 95, pastedChars: 0, pasteEvents: 0, deletions: 4 };
const pasted: MessageSignals = { typedMs: 600, typedChars: 0, pastedChars: 95, pasteEvents: 1, deletions: 0 };

describe("behaviourOf — what the composer measured, as one word", () => {
  it("typed by hand: most characters typed, at a human pace", () => expect(behaviourOf(typed, 95, params)).toBe("TYPED"));
  it("pasted: most characters arrived in a paste", () => expect(behaviourOf(pasted, 95, params)).toBe("PASTED"));
  it("faster than a hand can type without a paste: FAST", () => expect(behaviourOf({ typedMs: 2000, typedChars: 95, pastedChars: 0, pasteEvents: 0, deletions: 0 }, 95, params)).toBe("FAST"));
  it("no measure (another client, an old app): UNKNOWN, never a guess", () => {
    expect(behaviourOf(undefined, 95, params)).toBe("UNKNOWN");
    expect(behaviourOf({ typedMs: 0, typedChars: 0, pastedChars: 0, pasteEvents: 0, deletions: 0 }, 95, params)).toBe("UNKNOWN");
  });
  it("a bit of paste in a typed message is still typed", () => expect(behaviourOf({ ...typed, typedChars: 80, pastedChars: 15, pasteEvents: 1 }, 95, params)).toBe("TYPED"));
});

describe("signalFor — a signal, never a verdict, never a number", () => {
  it("under the minimum number of words: too short to judge, whatever the rest says", () => {
    expect(signalFor({ text: "Salut, ça va ?", detector: "HIGH", signals: pasted }, params)).toBe("TOO_SHORT");
  });
  it("typed by hand and nothing odd in the text: written by hand", () => {
    expect(signalFor({ text, detector: "LOW", signals: typed }, params)).toBe("HAND");
    expect(signalFor({ text, detector: "MID", signals: typed }, params)).toBe("HAND");
    expect(signalFor({ text, detector: "UNAVAILABLE", signals: typed }, params)).toBe("HAND");
  });
  it("« probably generated » needs two independent signs: the text reads as machine AND it arrived pasted (or too fast to type)", () => {
    expect(signalFor({ text, detector: "HIGH", signals: pasted }, params)).toBe("LIKELY_GENERATED");
    expect(signalFor({ text, detector: "HIGH", signals: { typedMs: 1500, typedChars: 95, pastedChars: 0, pasteEvents: 0, deletions: 0 } }, params)).toBe("LIKELY_GENERATED");
  });
  it("one sign alone is only uncertain: a machine-sounding text that was typed, or one with no measure, or a plain paste", () => {
    expect(signalFor({ text, detector: "HIGH", signals: typed }, params)).toBe("UNSURE");
    expect(signalFor({ text, detector: "HIGH", signals: undefined }, params)).toBe("UNSURE");
    expect(signalFor({ text, detector: "LOW", signals: pasted }, params)).toBe("UNSURE");
    expect(signalFor({ text, detector: "UNAVAILABLE", signals: pasted }, params)).toBe("UNSURE");
  });
  it("with no measure, a text that does not read as machine is written by hand; a doubtful one is uncertain", () => {
    expect(signalFor({ text, detector: "LOW", signals: undefined }, params)).toBe("HAND");
    expect(signalFor({ text, detector: "MID", signals: undefined }, params)).toBe("UNSURE");
    expect(signalFor({ text, detector: "UNAVAILABLE", signals: undefined }, params)).toBe("UNSURE");
  });
  it("the answer is one of four words — no number anywhere", () => {
    const all = [undefined, typed, pasted].flatMap((signals) => (["LOW", "MID", "HIGH", "UNAVAILABLE"] as const).map((detector) => signalFor({ text, detector, signals }, params)));
    expect(new Set(all)).toEqual(new Set(["HAND", "UNSURE", "LIKELY_GENERATED"]));
    expect(all.every((s) => ["HAND", "UNSURE", "LIKELY_GENERATED", "TOO_SHORT"].includes(s))).toBe(true);
  });
});
