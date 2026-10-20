import { describe, expect, it } from "vitest";

import { changelogPath, pagePath, PAGES } from "../../site/lib/site";

// next.config.mjs maps every landing address to its file — checked from the config itself.
const config = (await import("../next.config.mjs")).default as { rewrites: () => Promise<{ beforeFiles: { source: string; destination: string }[] }>; skipTrailingSlashRedirect?: boolean };

describe("landing rewrites", () => {
  it("maps each page, with and without a trailing slash, to its exported file", async () => {
    const { beforeFiles } = await config.rewrites();
    const map = Object.fromEntries(beforeFiles.map((r) => [r.source, r.destination]));
    expect(map["/"]).toBe("/index.html");
    for (const page of ["how-it-works", "demo", "fr", "fr/how-it-works", "fr/demo", "changelog", "fr/changelog"]) {
      expect(map[`/${page}`], page).toBe(`/${page}/index.html`);
      expect(map[`/${page}/`], page).toBe(`/${page}/index.html`);
    }
  });

  // yasakia: dev.yasakia.com/changelog/ answered 404 (the web app's locale redirect, then no page) because the export's
  // changelog was never mapped. Every address the site itself links to must have its rewrite — read from the site's own helpers.
  it("maps every address the site links to (its pages and its changelog, in both languages)", async () => {
    const { beforeFiles } = await config.rewrites();
    const sources = new Set(beforeFiles.map((r) => r.source));
    const addresses = (["en", "fr"] as const).flatMap((locale) => [...PAGES.map((page) => pagePath(locale, page)), changelogPath(locale)]);
    for (const address of addresses) expect(sources.has(address === "/" ? "/" : address), address).toBe(true);
  });

  it("serves the changelog's RSS feed in both languages as the exported file", async () => {
    const { beforeFiles } = await config.rewrites();
    const map = Object.fromEntries(beforeFiles.map((r) => [r.source, r.destination]));
    expect(map["/changelog/feed.xml"]).toBe("/changelog/feed.xml");
    expect(map["/fr/changelog/feed.xml"]).toBe("/fr/changelog/feed.xml");
  });

  it("keeps the export's trailing-slash addresses (canonical URLs) instead of redirecting them", () => {
    expect(config.skipTrailingSlashRedirect).toBe(true);
  });
});
