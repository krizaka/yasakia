import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { dateFormat, PRODUCT_TIME_ZONE } from "./format-date";

const dir = new URL("../components/console/", import.meta.url);

// The console crawl (scripts/check-console.mjs) found React hydration error #418 on the home and the talk pages of dev: dates were
// formatted in the server's zone (UTC) and again in the browser's. A date in the console is formatted in one zone, the product's.
describe("dates in the console are formatted in one time zone", () => {
  it("no console component builds a DateTimeFormat of its own (the zone would be the machine's)", () => {
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => /new Intl\.DateTimeFormat\(/.test(readFileSync(new URL(f, dir), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("gives the same text whatever the machine's zone is", () => {
    const iso = "2026-10-20T03:30:00Z";
    expect(PRODUCT_TIME_ZONE).toBe("America/Montreal");
    expect(dateFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))).toBe("Oct 19, 2026, 11:30 PM");
  });
});
