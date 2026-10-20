import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ACCOUNT_HREF, ADMIN_NAV, currentEntry, USER_NAV } from "./console-nav";

const shell = (locale: string) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")).console.shell as Record<string, string>;

describe("the console's navigation keeps its shape (docs/UX_DECISIONS.md)", () => {
  it("has at most five top-level entries for the person and for the operator", () => {
    expect(USER_NAV.length).toBeLessThanOrEqual(5);
    expect(ADMIN_NAV.length).toBeLessThanOrEqual(5);
  });

  it("lists the person's journey in order, with the account as a utility rather than a destination", () => {
    expect(USER_NAV.map((e) => e.href)).toEqual(["", "/talk", "/photos", "/batch", "/intros"]);
    expect(USER_NAV.map((e) => e.href)).not.toContain(ACCOUNT_HREF);
  });

  it("puts every operator page in exactly one section, and no page twice", () => {
    const pages = ADMIN_NAV.flatMap((e) => e.pages.map((p) => p.href));
    expect(new Set(pages).size).toBe(pages.length);
    expect([...pages].sort()).toEqual(["/admin", "/admin/analytics", "/admin/audit", "/admin/health", "/admin/intros", "/admin/reports", "/admin/rules", "/admin/users"]);
  });

  it("says every label in both languages", () => {
    for (const locale of ["en", "fr"]) {
      const words = shell(locale);
      for (const entry of [...USER_NAV, ...ADMIN_NAV]) for (const page of [{ label: entry.label }, ...entry.pages]) expect(words[page.label], `${locale} ${page.label}`).toBeTruthy();
      expect(words.account, locale).toBeTruthy();
    }
  });

  it("finds the entry and the page a path belongs to", () => {
    const home = "/app/en";
    expect(currentEntry(USER_NAV, "/app/en", home)?.entry.label).toBe("dashboard");
    expect(currentEntry(USER_NAV, "/app/en/photos", home)?.entry.label).toBe("photos");
    expect(currentEntry(ADMIN_NAV, "/app/en/admin/reports", home)).toMatchObject({ entry: { label: "users" }, page: { label: "reports" } });
    expect(currentEntry(ADMIN_NAV, "/app/en/admin/health", home)?.entry.label).toBe("system");
    expect(currentEntry(ADMIN_NAV, "/app/en/admin", home)?.entry.label).toBe("overview");
    expect(currentEntry(ADMIN_NAV, "/app/en/account", home)).toBeNull();
  });
});
