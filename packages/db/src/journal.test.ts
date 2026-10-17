import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// The release job applies every migration newer than the last applied one (migrations.ts): a migration whose `when` is
// older than its predecessor's is silently skipped — measured on dev, 0007 (analytics_outbox) never ran.
describe("the migration journal", () => {
  it("is strictly increasing in time, in the order of its files", () => {
    const journal = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../drizzle/meta/_journal.json"), "utf8")) as { entries: { idx: number; when: number; tag: string }[] };
    for (let i = 1; i < journal.entries.length; i++) {
      expect(journal.entries[i].when, `${journal.entries[i].tag} after ${journal.entries[i - 1].tag}`).toBeGreaterThan(journal.entries[i - 1].when);
    }
  });
});
