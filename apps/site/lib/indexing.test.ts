import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { auditRobots } from "../../../scripts/check-seo-family.mjs";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { indexable } from "./indexing";
import { pageMetadata } from "./seo";
import { SITE_URL } from "./site";

afterEach(() => vi.unstubAllEnvs());

const robotsText = (r: ReturnType<typeof robots>) => {
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  return `${rules.map((rule) => `User-Agent: ${rule.userAgent}\n${rule.allow ? `Allow: ${rule.allow}\n` : ""}${rule.disallow ? `Disallow: ${rule.disallow}\n` : ""}`).join("\n")}${r.sitemap ? `\nSitemap: ${r.sitemap}\n` : ""}`;
};

describe("APP_SEARCH_INDEXING — the public landing of a dev deployment", () => {
  it("is open by default and closed only by `off`", () => {
    expect(indexable({})).toBe(true);
    expect(indexable({ APP_SEARCH_INDEXING: "off" })).toBe(false);
  });

  it("off: robots.txt disallows everything and names no sitemap, the sitemap is empty, every page is noindex", () => {
    vi.stubEnv("APP_SEARCH_INDEXING", "off");
    const text = robotsText(robots());
    expect(auditRobots(text, { host: SITE_URL, index: false })).toEqual([]);
    expect(text).not.toMatch(/sitemap/i);
    expect(sitemap()).toEqual([]);
    expect(pageMetadata("en", "home").robots).toMatchObject({ index: false, follow: false });
  });

  it("on: indexed as before (no robots meta)", () => {
    expect(pageMetadata("fr", "demo").robots).toBeUndefined();
    expect(sitemap().length).toBeGreaterThan(0);
  });

  it("the dev line exists in both languages and is rendered by every page view, after the footer", () => {
    expect(en.chrome.devNotice).toBe("Development environment — access by invitation");
    expect(fr.chrome.devNotice).toBe("Environnement de développement — accès sur invitation");
    const views = readFileSync(new URL("../components/views.tsx", import.meta.url), "utf8");
    expect(views.match(/<DevEnvironmentNotice locale=\{locale\} \/>/g)).toHaveLength(3);
  });
});
