import { describe, expect, it } from "vitest";

import { AnalyticsKind, type Insights, kindCount, LOOP_FUNNEL, pseudonymOf, retryDelaySeconds, toAnalyticsEvent } from "./analytics";

const KEY = "k".repeat(32);

describe("what leaves Yasakia for Orazaka's analytics", () => {
  it("a pseudonym, never the account id — stable, keyed, product-scoped", () => {
    const p = pseudonymOf("2f1c7a40-0000-4000-8000-000000000001", KEY);
    expect(p).toMatch(/^[a-f0-9]{64}$/);
    expect(pseudonymOf("2f1c7a40-0000-4000-8000-000000000001", KEY)).toBe(p);
    expect(pseudonymOf("2f1c7a40-0000-4000-8000-000000000001", "x".repeat(32))).not.toBe(p);
  });

  it("an event carries the pseudonym, the kind, the value and the time — nothing else", () => {
    const event = toAnalyticsEvent({ id: "e1", accountId: "acc-1", kind: AnalyticsKind.BatchAnswer, value: null, at: "2026-10-17T08:00:00.000Z" }, KEY);
    expect(Object.keys(event).sort()).toEqual(["at", "id", "item", "kind", "owner", "subject", "value"]);
    expect(event.kind).toBe("batch_answer");
    expect(JSON.stringify(event)).not.toContain("acc-1");
  });

  it("retries with a doubling delay, capped at an hour", () => {
    expect([0, 1, 2].map(retryDelaySeconds)).toEqual([15, 30, 60]);
    expect(retryDelaySeconds(20)).toBe(3600);
  });

  it("the loop's funnel is batch → answer → introduction", () => {
    expect(LOOP_FUNNEL).toEqual(["batch_open", "batch_answer", "intro_start"]);
  });

  it("a kind under the audience threshold is null, never 0", () => {
    const insights = { minAudience: 3, suppressed: false, events: null, activeSubjects: null, series: [], cohorts: [], kinds: [{ kind: "talk", unit: "SECONDS", count: { current: 12, previous: 4, change: 2 }, subjects: 4, valueSum: null, valueMean: null }] } satisfies Insights;
    expect(kindCount(insights, AnalyticsKind.Talk)).toEqual({ value: 12, previous: 4 });
    expect(kindCount(insights, AnalyticsKind.ReportFiled)).toEqual({ value: null, previous: null });
  });
});
