import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLOSED_ROBOTS, NOINDEX_HEADER, proxy } from "../proxy";
import { indexable } from "./indexing";

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
