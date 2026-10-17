import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { groupOf, NAV_GROUPS, NAV_MAX_LEFT, signInHref } from "./nav";
import { PAGES } from "./site";

const chrome = readFileSync(join(__dirname, "../components/SiteChrome.tsx"), "utf8");

describe("the bar's shape (the product-site navigation standard)", () => {
  it("has at most four entries on the left, and a group is a real menu — never a lone entry", () => {
    expect(NAV_GROUPS.length).toBeLessThanOrEqual(NAV_MAX_LEFT);
    for (const group of NAV_GROUPS) expect(group.pages.length, group.id).toBeGreaterThanOrEqual(2);
  });

  it("holds every page of the site in exactly one group, the overview first — no orphan, no duplicate", () => {
    const held = NAV_GROUPS.flatMap((g) => g.pages);
    expect([...held].sort()).toEqual([...PAGES].sort());
    expect(new Set(held).size).toBe(held.length);
    expect(NAV_GROUPS[0].pages[0]).toBe("home");
    for (const page of PAGES) expect(groupOf(page)).toBe("product");
  });

  it("words every group and every entry, in both languages", () => {
    for (const messages of [en, fr]) {
      for (const group of NAV_GROUPS) {
        expect(messages.chrome.nav, group.id).toHaveProperty(group.id);
        for (const page of group.pages) {
          expect(messages.chrome.menu_product, page).toHaveProperty(page);
          expect(messages.chrome.menu_product[page].title.length).toBeGreaterThan(2);
          expect(messages.chrome.menu_product[page].text.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it("carries no version chip, no family switcher and no dead entry: the bar is built from the groups", () => {
    expect(chrome).not.toMatch(/NavBar\.Badge/);
    expect(chrome).not.toMatch(/NavBar\.Family/);
    expect(chrome).toMatch(/NAV_GROUPS\.map/);
    // The mobile panel takes the same groups, in the same order, then sign in and the language.
    const mobile = chrome.slice(chrome.indexOf("<NavBar.Mobile"));
    expect(mobile).toMatch(/NAV_GROUPS\.map/);
    expect(mobile.indexOf("NAV_GROUPS.map")).toBeLessThan(mobile.indexOf("signInHref"));
  });

  it("offers sign-in by invitation, to the person's space, in each language — and still no sign-up", () => {
    expect(signInHref("en")).toBe("/app/en/sign-in");
    expect(signInHref("fr")).toBe("/app/fr/sign-in");
    expect(en.chrome.signIn.toLowerCase()).toContain("invitation");
    expect(fr.chrome.signIn.toLowerCase()).toContain("invitation");
  });
});
