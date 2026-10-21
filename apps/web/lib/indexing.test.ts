import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLOSED_ROBOTS, NOINDEX_HEADER, proxy } from "../proxy";
import { devRedirect, indexable, indexableOn, isDevHost, publicHost } from "./indexing";

afterEach(() => vi.unstubAllEnvs());

const ask = (path: string, host = "dev.yasakia.com") => proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));

describe("APP_SEARCH_INDEXING on the app (pages, legal, console, API)", () => {
  it("is open by default and closed only by `off`", () => {
    expect(indexable({})).toBe(true);
    expect(indexable({ APP_SEARCH_INDEXING: "off" })).toBe(false);
  });

  it("off: noindex on every response — the landing, legal pages, the console, the API — robots closed, no sitemap", async () => {
    vi.stubEnv("APP_SEARCH_INDEXING", "off");
    for (const path of ["/", "/fr", "/en/privacy", "/app/en/sign-in", "/api/healthz", "/api/me/photos"]) {
      expect(ask(path).headers.get("x-robots-tag"), path).toBe(NOINDEX_HEADER);
    }
    const robots = ask("/robots.txt");
    expect(await robots.text()).toBe(CLOSED_ROBOTS);
    expect(CLOSED_ROBOTS).not.toMatch(/sitemap/i);
    expect(ask("/sitemap.xml").status).toBe(404);
  });

  it("on: the product host is not closed; the console host always is, robots included", async () => {
    vi.stubEnv("APP_SEARCH_INDEXING", "on");
    vi.stubEnv("APP_ADMIN_HOST", "admin.yasakia.com");
    expect(ask("/").headers.get("x-robots-tag")).toBeNull();
    expect(ask("/robots.txt").headers.get("x-robots-tag")).toBeNull();
    const admin = ask("/robots.txt", "admin.yasakia.com");
    expect(await admin.text()).toBe(CLOSED_ROBOTS);
    expect(admin.headers.get("x-robots-tag")).toBe(NOINDEX_HEADER);
    expect(ask("/", "admin.yasakia.com").headers.get("x-robots-tag")).toBe(NOINDEX_HEADER);
  });
});

const ENV = { APP_SEARCH_INDEXING: "off", NEXT_PUBLIC_APP_URL: "https://www.yasakia.com", APP_DEV_HOST: "dev.yasakia.com" };

describe("the public host is indexed, the dev host never (epic krizaka/.github#119)", () => {
  it("a closed deployment (off) stays closed everywhere but on the host of NEXT_PUBLIC_APP_URL", () => {
    expect(publicHost(ENV)).toBe("www.yasakia.com");
    expect(indexableOn("www.yasakia.com", ENV)).toBe(true);
    expect(indexableOn("WWW.yasakia.com:443", ENV)).toBe(true);
    expect(indexableOn("dev.yasakia.com", ENV)).toBe(false);
    expect(indexableOn("admin.yasakia.com", ENV)).toBe(false);
    expect(indexableOn("anything.test", ENV)).toBe(false);
    expect(indexableOn("dev.yasakia.com", { APP_SEARCH_INDEXING: "on" })).toBe(true);
  });

  it("the dev host is the one APP_DEV_HOST names", () => {
    expect(isDevHost("dev.yasakia.com", ENV)).toBe(true);
    expect(isDevHost("www.yasakia.com", ENV)).toBe(false);
    expect(isDevHost("dev.yasakia.com", {})).toBe(false);
  });

  it("on the dev host every HTML page goes to www (308 target, same path and query); the API, auth, webhooks, .well-known, healthz and robots stay", () => {
    const go = (path: string, method = "GET") => devRedirect(method, path.split("?")[0]!, path.includes("?") ? `?${path.split("?")[1]}` : "", "https://www.yasakia.com");
    expect(go("/en")).toBe("https://www.yasakia.com/en");
    expect(go("/en/sign-in?next=%2Fapp")).toBe("https://www.yasakia.com/en/sign-in?next=%2Fapp");
    expect(go("/")).toBe("https://www.yasakia.com/");
    expect(go("/sitemap.xml")).toBe("https://www.yasakia.com/sitemap.xml");
    expect(go("/en", "HEAD")).toBe("https://www.yasakia.com/en");
    for (const stay of ["/api/healthz", "/api/internal/sync", "/api/auth/callback", "/.well-known/assetlinks.json", "/healthz", "/robots.txt"]) expect(go(stay), stay).toBeNull();
    expect(go("/en/sign-in", "POST")).toBeNull();
    expect(go("/apix")).toBe("https://www.yasakia.com/apix");
  });

});

describe("dev.yasakia.com leaves search; www.yasakia.com is public (epic krizaka/.github#119)", () => {
  const setup = () => {
    vi.stubEnv("APP_SEARCH_INDEXING", "on");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.yasakia.com");
    vi.stubEnv("APP_DEV_HOST", "dev.yasakia.com");
    vi.stubEnv("APP_ADMIN_HOST", "admin.yasakia.com");
  };

  it("www is not closed: no noindex, robots.txt and the sitemap are the landing's", () => {
    setup();
    expect(ask("/", "www.yasakia.com").headers.get("x-robots-tag")).toBeNull();
    expect(ask("/robots.txt", "www.yasakia.com").headers.get("x-robots-tag")).toBeNull();
  });

  it("dev: a page answers 308 to the same path on www, noindex, even with the flag on", () => {
    setup();
    const res = ask("/app/en/sign-in?next=%2Fapp%2Fen", "dev.yasakia.com");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://www.yasakia.com/app/en/sign-in?next=%2Fapp%2Fen");
    expect(res.headers.get("x-robots-tag")).toBe(NOINDEX_HEADER);
    expect(ask("/fr", "dev.yasakia.com").headers.get("location")).toBe("https://www.yasakia.com/fr");
  });

  it("dev: robots.txt is Disallow: /; the API and .well-known keep serving, noindex", async () => {
    setup();
    expect(await ask("/robots.txt", "dev.yasakia.com").text()).toBe(CLOSED_ROBOTS);
    for (const path of ["/api/healthz", "/api/me/photos", "/.well-known/apple-app-site-association", "/.well-known/assetlinks.json"]) {
      const res = ask(path, "dev.yasakia.com");
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location"), path).toBeNull();
      expect(res.headers.get("x-robots-tag"), path).toBe(NOINDEX_HEADER);
    }
  });
});
