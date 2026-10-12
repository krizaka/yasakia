import { memoryBus } from "@krizaka/realtime";
import { afterEach, describe, expect, it } from "vitest";

import { accountTopic, EVENT_TYPES, isYazakiaEvent, publishToAccount, subscribeToAccount, useRealtimeBus, type YazakiaEvent } from "./realtime";

afterEach(() => useRealtimeBus(null));

describe("the realtime door knows typed events only", () => {
  it("delivers an account's events to that account, and only those", async () => {
    useRealtimeBus(memoryBus());
    const ada: YazakiaEvent[] = [];
    const bea: YazakiaEvent[] = [];
    subscribeToAccount("ada", (e) => ada.push(e));
    subscribeToAccount("bea", (e) => bea.push(e));
    await publishToAccount("ada", { type: "batch.ready", batchId: "b1" });
    await publishToAccount("ada", { type: "intro.message", introId: "i1", messageId: "m1" });
    expect(ada).toEqual([
      { type: "batch.ready", batchId: "b1" },
      { type: "intro.message", introId: "i1", messageId: "m1" },
    ]);
    expect(bea).toEqual([]);
  });

  it("drops anything on the bus that is not one of its events", async () => {
    const bus = memoryBus();
    useRealtimeBus(bus);
    const got: YazakiaEvent[] = [];
    subscribeToAccount("ada", (e) => got.push(e));
    await bus.publish(accountTopic("ada"), { type: "batch.ready" });
    await bus.publish(accountTopic("ada"), { type: "something.else", batchId: "x" });
    await bus.publish(accountTopic("ada"), "text");
    expect(got).toEqual([]);
  });

  it("names the three events of the foundations", () => {
    expect(EVENT_TYPES).toEqual(["batch.ready", "intro.opened", "intro.message"]);
    expect(isYazakiaEvent({ type: "intro.opened", introId: "i" })).toBe(true);
    expect(isYazakiaEvent({ type: "intro.opened" })).toBe(false);
  });
});
