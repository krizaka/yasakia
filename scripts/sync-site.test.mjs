import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { syncSite } from "./sync-site.mjs";

const put = (dir, path, text) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};

describe("the landing is copied into the web app's public folder", () => {
  it("keeps the pages and root files at their paths and moves the chunks under /site-assets", () => {
    const out = mkdtempSync(join(tmpdir(), "out-"));
    for (const [p, t] of Object.entries({ "index.html": "<html>en", "fr/index.html": "<html>fr", "how-it-works/index.html": "h", "robots.txt": "r", "sitemap.xml": "s", "llms.txt": "l", "og.png": "p", "__next._tree.txt": "t", "_next/static/a.js": "js", "404.html": "x", "_not-found/index.html": "x", "404/index.html": "x" })) put(out, p, t);
    const target = mkdtempSync(join(tmpdir(), "public-"));
    const names = syncSite(out, target);
    expect(names).toEqual(expect.arrayContaining(["index.html", "fr", "how-it-works", "robots.txt", "sitemap.xml", "llms.txt", "og.png", "__next._tree.txt", "site-assets"]));
    expect(names).not.toContain("_next");
    expect(names).not.toContain("404.html");
    expect(names).not.toContain("_not-found");
    expect(readFileSync(join(target, "site-assets/_next/static/a.js"), "utf8")).toBe("js");
    expect(readFileSync(join(target, "fr/index.html"), "utf8")).toBe("<html>fr");
  });

  it("refuses to run before the export exists", () => {
    expect(() => syncSite(mkdtempSync(join(tmpdir(), "empty-")), mkdtempSync(join(tmpdir(), "t-")))).toThrow(/npm run build:site/);
  });
});
