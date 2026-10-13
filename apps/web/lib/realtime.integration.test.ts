import { describe, expect, it } from "vitest";

import { realtimeConfig } from "./env";
import { accountTopic, createYazakiaBus, isYazakiaEvent } from "./realtime";

/**
 * The bus contract against real servers — two buses stand for two instances of the API: an event published on one
 * reaches the subscribers of the other, in order. Runs with REALTIME_IT=1 (CI: PostgreSQL with pgvector and Valkey).
 */
const enabled = process.env.REALTIME_IT === "1";
const kinds = (["postgres", ...(process.env.REALTIME_REDIS_URL ? ["redis"] : [])] as const).map((kind) => kind);

describe.skipIf(!enabled)("realtime across instances", () => {
  for (const kind of kinds) {
    it(`${kind}: an event published on one instance reaches the other, in order`, async () => {
      const config = { ...realtimeConfig({ ...process.env, REALTIME_BUS: kind }), prefix: `yazakia:it:${Date.now()}:` };
      const one = createYazakiaBus(config);
      const two = createYazakiaBus(config);
      const until = Date.now() + 10_000;
      while ((!one.connected || !two.connected) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
      const received: unknown[] = [];
      const off = two.subscribe(accountTopic("ada"), (event) => {
        if (isYazakiaEvent(event)) received.push(event);
      });
      await new Promise((r) => setTimeout(r, 300));
      for (let i = 0; i < 5; i++) await one.publish(accountTopic("ada"), { type: "intro.message", introId: "i", messageId: `m${i}` });
      const deadline = Date.now() + 5000;
      while (received.length < 5 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      off();
      await one.close();
      await two.close();
      expect(received.map((e) => (e as { messageId: string }).messageId)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
    }, 20_000);
  }
});
