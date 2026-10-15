import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { allowedOnAdminHost, hostKind, isAdminPath } from "./host";

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
    for (const p of ["/admin", "/en/admin", "/fr/admin/users", "/en/admin/users/abc", "/api/admin/users", "/api/admin"]) expect(isAdminPath(p), p).toBe(true);
    for (const p of ["/en", "/en/account", "/en/administrators", "/api/me", "/en/sign-in"]) expect(isAdminPath(p), p).toBe(false);
  });
  it("serves on the admin host the administration, the sign-in and what they need — nothing else", () => {
    for (const p of ["/en/admin/reports", "/en/sign-in", "/fr/sign-in/", "/api/auth/password", "/api/auth/sign-out", "/api/healthz", "/api/events"]) expect(allowedOnAdminHost(p), p).toBe(true);
    for (const p of ["/en/account", "/en/privacy", "/api/me", "/api/blocks", "/random"]) expect(allowedOnAdminHost(p), p).toBe(false);
  });
});

describe("proxy", async () => {
  process.env.APP_ADMIN_HOST = "admin.yasakia.com";
  const { proxy } = await import("../proxy");
  const call = (url: string, host: string) => proxy(new NextRequest(url, { headers: { host } }));
  it("is a 404 for the administration on any other host", () => {
    expect(call("https://dev.yasakia.com/en/admin/users", "dev.yasakia.com")?.status).toBe(404);
    expect(call("https://dev.yasakia.com/api/admin/users", "dev.yasakia.com")?.status).toBe(404);
  });
  it("never redirects the API to a language", () => {
    expect(call("https://dev.yasakia.com/api/admin/reports", "dev.yasakia.com")?.status).toBe(404);
    expect(call("https://admin.yasakia.com/api/admin/reports", "admin.yasakia.com")).toBeUndefined();
  });
  it("is a 404 on the admin host for the person's pages, and opens the console's overview from the root", () => {
    expect(call("https://admin.yasakia.com/en/account", "admin.yasakia.com")?.status).toBe(404);
    const root = call("https://admin.yasakia.com/en", "admin.yasakia.com");
    expect(root?.status).toBe(307);
    expect(root?.headers.get("location")).toContain("/en/admin");
    expect(call("https://admin.yasakia.com/en/admin/users", "admin.yasakia.com")?.status).not.toBe(404);
  });
});
