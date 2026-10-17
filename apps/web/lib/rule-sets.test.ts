import { describe, expect, it } from "vitest";

import { HttpError } from "./http";
import { changedParams, checkRuleParams, parseRuleDomain, RuleDomain, ruleFields } from "./rule-sets";

const matching = { batchMin: 3, batchMax: 5, batchHours: 72, candidatePool: 400, minAffinity: 0.55, introDays: 7 };
const agent = { minUserTurns: 6, historyMessages: 60, messageMaxChars: 1200, requiredFacets: ["intent", "pace"], minFacets: 3 };

const refusal = (fn: () => unknown): { status: number; code: unknown } => {
  try {
    fn();
  } catch (error) {
    if (error instanceof HttpError) return { status: error.status, code: (error.extra as { code?: unknown }).code };
    throw error;
  }
  throw new Error("expected a refusal");
};

describe("an operator publishes a rule set (versioned, bounded, never a constant)", () => {
  it("knows the two domains the app reads, and nothing else", () => {
    expect(parseRuleDomain("MATCHING")).toBe(RuleDomain.Matching);
    expect(parseRuleDomain("AGENT")).toBe(RuleDomain.Agent);
    expect(refusal(() => parseRuleDomain("CUSTOMIZATION"))).toEqual({ status: 404, code: "NOT_FOUND" });
  });

  it("accepts parameters inside the bounds the code holds", () => {
    expect(checkRuleParams(RuleDomain.Matching, matching)).toEqual(matching);
    expect(checkRuleParams(RuleDomain.Agent, agent)).toEqual(agent);
  });

  it("refuses parameters outside the bounds, unknown keys, and a batch whose minimum exceeds its maximum (422)", () => {
    expect(refusal(() => checkRuleParams(RuleDomain.Matching, { ...matching, minAffinity: 1.5 }))).toEqual({ status: 422, code: "RULES_OUT_OF_BOUNDS" });
    expect(refusal(() => checkRuleParams(RuleDomain.Matching, { ...matching, batchMin: 6, batchMax: 4 }))).toEqual({ status: 422, code: "RULES_OUT_OF_BOUNDS" });
    expect(refusal(() => checkRuleParams(RuleDomain.Matching, { ...matching, accentColor: "#10b981" }))).toEqual({ status: 422, code: "RULES_OUT_OF_BOUNDS" });
    expect(refusal(() => checkRuleParams(RuleDomain.Agent, { ...agent, minUserTurns: 0 }))).toEqual({ status: 422, code: "RULES_OUT_OF_BOUNDS" });
  });

  it("names what changed — the preview before publishing and the audit line after", () => {
    expect(changedParams(matching, { ...matching, batchMax: 6, minAffinity: 0.6 })).toEqual(["batchMax", "minAffinity"]);
    expect(changedParams(agent, { ...agent, requiredFacets: ["intent"] })).toEqual(["requiredFacets"]);
    expect(changedParams(matching, matching)).toEqual([]);
  });

  it("offers each number with the bounds the code holds — a slider, never a free field", () => {
    expect(ruleFields(RuleDomain.Matching)).toEqual([
      { key: "batchMin", min: 1, max: 10, step: 1 },
      { key: "batchMax", min: 1, max: 10, step: 1 },
      { key: "batchHours", min: 1, max: 336, step: 1 },
      { key: "candidatePool", min: 10, max: 2000, step: 10 },
      { key: "minAffinity", min: 0, max: 1, step: 0.01 },
      { key: "introDays", min: 1, max: 30, step: 1 },
    ]);
    expect(ruleFields(RuleDomain.Agent).map((f) => f.key)).toEqual(["minUserTurns", "historyMessages", "messageMaxChars", "minFacets"]);
  });
});
