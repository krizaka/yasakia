import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { allowedOnAdminHost, hostKind, isAdminPath, isLandingPath } from "./host";

const env = { APP_ADMIN_HOST: "admin.yasakia.com" };
const headers = (host: string, forwarded?: string) => new Headers({ host, ...(forwarded ? { "x-forwarded-host": forwarded } : {}) });

describe("host kinds", () => {
  it("is open everywhere when no admin host is configured (local development)", () => {
    expect(hostKind(headers("localhost:3000"), {})).toBe("open");
  });
  it("tells the admin host from the rest, behind the platform's proxy too", () => {
    expect(hostKind(headers("admin.yasakia.com"), env)).toBe("admin");
    expect(hostKind(headers("ADMIN.yasakia.com:443"), env)).toBe("admin");
    expect(hostKind(headers("internal", "admin.yasakia.com"), env)).toBe("admin");
    expect(hostKind(headers("dev.yasakia.com"), env)).toBe("app");
    expect(hostKind(headers("admin.yasakia.com.evil.example"), env)).toBe("app");
  });
});

describe("admin paths", () => {
  it("knows what is the administration", () => {
    for (const p of ["/app/en/admin", "/app/fr/admin/users", "/app/en/admin/users/abc", "/api/admin/users", "/api/admin"]) expect(isAdminPath(p), p).toBe(true);
    for (const p of ["/en", "/app/en/account", "/app/en/administrators", "/api/me", "/app/en/sign-in", "/en/admin"]) expect(isAdminPath(p), p).toBe(false);
  });
  it("serves on the admin host the administration, the sign-in and what they need — nothing else", () => {
    for (const p of ["/app/en/admin/reports", "/app/en/sign-in", "/app/fr/sign-in/", "/api/auth/password", "/api/auth/sign-out", "/api/healthz", "/api/events"]) expect(allowedOnAdminHost(p), p).toBe(true);
    for (const p of ["/app/en/account", "/en/privacy", "/api/me", "/api/blocks", "/random", "/how-it-works"]) expect(allowedOnAdminHost(p), p).toBe(false);
  });
});

describe("landing paths", () => {
  it("knows the pages of the public landing, with or without a slash", () => {
    for (const p of ["/", "/fr", "/fr/", "/how-it-works", "/how-it-works/", "/demo", "/fr/demo/", "/fr/how-it-works", "/changelog", "/changelog/", "/fr/changelog", "/fr/changelog/"]) expect(isLandingPath(p), p).toBe(true);
    for (const p of ["/en", "/en/privacy", "/fr/privacy", "/app/en", "/how-it-works/x", "/changelog/x", "/en/changelog", "/api/healthz"]) expect(isLandingPath(p), p).toBe(false);
  });
});

describe("proxy", async () => {
  process.env.APP_ADMIN_HOST = "admin.yasakia.com";
  const { proxy } = await import("../proxy");
  const call = (url: string, host: string) => proxy(new NextRequest(url, { headers: { host } }));
  it("is a 404 for the administration on any other host", () => {
    expect(call("https://dev.yasakia.com/app/en/admin/users", "dev.yasakia.com")?.status).toBe(404);
    expect(call("https://dev.yasakia.com/api/admin/users", "dev.yasakia.com")?.status).toBe(404);
  });
  it("never redirects the API to a language", () => {
    expect(call("https://dev.yasakia.com/api/admin/reports", "dev.yasakia.com")?.status).toBe(404);
    // Passed through (not redirected, not hidden) — carrying the console host's noindex.
    const passed = call("https://admin.yasakia.com/api/admin/reports", "admin.yasakia.com");
    expect(passed?.headers.get("x-middleware-next")).toBe("1");
    expect(passed?.headers.get("location")).toBeNull();
    expect(passed?.headers.get("x-robots-tag")).toContain("noindex");
  });
  it("is a 404 on the admin host for the person's pages, and opens the console's overview from the root", () => {
    expect(call("https://admin.yasakia.com/app/en/account", "admin.yasakia.com")?.status).toBe(404);
    const root = call("https://admin.yasakia.com/app/en", "admin.yasakia.com");
    expect(root?.status).toBe(307);
    expect(root?.headers.get("location")).toContain("/app/en/admin");
    expect(call("https://admin.yasakia.com/app/en/admin/users", "admin.yasakia.com")?.status).not.toBe(404);
  });
});
