import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { loadReleases } from "./changelog";
import { changelogPath, PAGES } from "./site";

const read = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

afterEach(() => vi.unstubAllGlobals());

describe("/changelog", () => {
  it("reads the merged pull requests into weeks, the latest first, housekeeping left out", async () => {
    const pulls = [
      { title: "feat(chat): voice replies (#12)", html_url: "https://github.com/krizaka/yasakia/pull/12", merged_at: "2026-10-16T10:00:00Z" },
      { title: "chore: bump", html_url: "https://github.com/krizaka/yasakia/pull/13", merged_at: "2026-10-16T11:00:00Z" },
      { title: "fix: XSS in the export (#9)", html_url: "https://github.com/krizaka/yasakia/pull/9", merged_at: "2026-10-07T10:00:00Z" },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(pulls))));
    const releases = await loadReleases();
    expect(releases.map((r) => r.version)).toEqual(["2026-10-12", "2026-10-05"]);
    expect(releases[0].changes.map((c) => c.tag)).toEqual(["feature"]);
    expect(releases[1].changes[0].tag).toBe("security");
  });

  it("is empty, not broken, when GitHub cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403 })));
    expect(await loadReleases()).toEqual([]);
  });

  it("exists in both languages with its feed and its sitemap entries", () => {
    expect(changelogPath("en")).toBe("/changelog/");
    expect(changelogPath("fr")).toBe("/fr/changelog/");
    expect(PAGES).not.toContain("changelog");
    for (const file of ["app/(root)/changelog/page.tsx", "app/[locale]/changelog/page.tsx"]) expect(read(file)).toContain("<ChangelogView");
    for (const file of ["app/(root)/changelog/feed.xml/route.ts", "app/[locale]/changelog/feed.xml/route.ts"]) expect(read(file)).toContain("changelogFeed");
    expect(read("components/ChangelogView.tsx")).toContain("await loadReleases()");
    expect(read("app/sitemap.ts")).toContain("changelogPath");
    for (const m of [en, fr]) {
      expect(m.changelog.title).toBeTruthy();
      expect(m.changelog.kinds.security).toBeTruthy();
    }
  });

  it("the footer's version links /changelog#<version>, the page owns that anchor", () => {
    expect(read("components/SiteChrome.tsx")).toContain("`${changelogPath(locale)}#${APP_VERSION}`");
    expect(read("components/ChangelogBody.tsx")).toContain("<span id={version}>");
    expect(read("components/ChangelogView.tsx")).toContain("version={APP_VERSION}");
  });
});
