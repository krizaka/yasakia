import { describe, expect, it } from "vitest";

import { assertSameOrigin } from "./auth";
import { ipAllowedForConsole } from "./console-access";
import { basePath, consoleAllowedIps, isDevDeployment, signupEnabled } from "./env";
import { describeAgent, sessionCookie, sessionTokenFrom } from "./web-session";

const TOKEN = `yw1.${"a".repeat(43)}`;

describe("sign-up gate", () => {
  it("is closed unless the variable says true", () => {
    expect(signupEnabled({})).toBe(false);
    expect(signupEnabled({ AUTH_SIGNUP_ENABLED: "" })).toBe(false);
    expect(signupEnabled({ AUTH_SIGNUP_ENABLED: "false" })).toBe(false);
    expect(signupEnabled({ AUTH_SIGNUP_ENABLED: "1" })).toBe(false);
    expect(signupEnabled({ AUTH_SIGNUP_ENABLED: "true" })).toBe(true);
    expect(signupEnabled({ AUTH_SIGNUP_ENABLED: " TRUE " })).toBe(true);
  });
});

describe("console address allow-list", () => {
  it("lets every address in outside production, nobody in production without a list", () => {
    expect(consoleAllowedIps({ NODE_ENV: "development" })).toBeNull();
    expect(consoleAllowedIps({ NODE_ENV: "production" })).toEqual([]);
    expect(consoleAllowedIps({ NODE_ENV: "production", AUTH_ALLOWED_IPS: "142.122.41.109, 203.0.113.7" })).toEqual(["142.122.41.109", "203.0.113.7"]);
  });

  it("accepts only a listed client address", () => {
    const env = { NODE_ENV: "production", AUTH_ALLOWED_IPS: "142.122.41.109", ABUSE_CLIENT_IP_HEADER: "do-connecting-ip" };
    expect(ipAllowedForConsole(new Headers({ "do-connecting-ip": "142.122.41.109" }), env)).toBe(true);
    expect(ipAllowedForConsole(new Headers({ "do-connecting-ip": "198.51.100.9" }), env)).toBe(false);
    expect(ipAllowedForConsole(new Headers(), env)).toBe(false);
    expect(ipAllowedForConsole(new Headers({ "do-connecting-ip": "142.122.41.109" }), { NODE_ENV: "production", ABUSE_CLIENT_IP_HEADER: "do-connecting-ip" })).toBe(false);
  });
});

describe("app path and dev deployment", () => {
  it("normalises the base path", () => {
    expect(basePath({})).toBe("");
    expect(basePath({ NEXT_PUBLIC_APP_BASE_PATH: "/" })).toBe("");
    expect(basePath({ NEXT_PUBLIC_APP_BASE_PATH: "app/" })).toBe("/app");
    expect(basePath({ NEXT_PUBLIC_APP_BASE_PATH: "/app" })).toBe("/app");
  });
  it("knows a dev deployment only by its variable", () => {
    expect(isDevDeployment({ NEXT_PUBLIC_APP_ENV: "dev" })).toBe(true);
    expect(isDevDeployment({ NEXT_PUBLIC_APP_ENV: "production" })).toBe(false);
    expect(isDevDeployment({})).toBe(false);
  });
});

describe("web session cookie", () => {
  it("reads only a well-formed token", () => {
    expect(sessionTokenFrom(`a=b; yasakia_session=${TOKEN}; c=d`)).toBe(TOKEN);
    expect(sessionTokenFrom("yasakia_session=yw1.short")).toBeUndefined();
    expect(sessionTokenFrom("yasakia_session=other")).toBeUndefined();
    expect(sessionTokenFrom(null)).toBeUndefined();
  });
  it("is HttpOnly, SameSite=Lax, scoped to the app path, Secure in production", () => {
    const dev = sessionCookie(TOKEN, {});
    expect(dev).toContain("HttpOnly");
    expect(dev).toContain("SameSite=Lax");
    expect(dev).toContain("Path=/;");
    expect(dev).not.toContain("Secure");
    const prod = sessionCookie(TOKEN, { NODE_ENV: "production", NEXT_PUBLIC_APP_BASE_PATH: "/app" });
    expect(prod).toContain("Secure");
    expect(prod).toContain("Path=/app;");
    expect(sessionCookie(null, {})).toContain("Max-Age=0");
  });
  it("describes a browser without trusting it", () => {
    expect(describeAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15")).toEqual({ browser: "Safari", system: "macOS" });
    expect(describeAgent(null)).toEqual({ browser: "", system: "" });
  });
});

describe("same-origin check for cookie writes", () => {
  const req = (method: string, headers: Record<string, string>) => new Request("http://app.internal/api/me", { method, headers });
  it("lets reads through", () => expect(() => assertSameOrigin(req("GET", {}))).not.toThrow());
  it("accepts a write from the same host", () => expect(() => assertSameOrigin(req("POST", { host: "dev.yasakia.com", origin: "https://dev.yasakia.com" }))).not.toThrow());
  it("prefers the forwarded host behind the platform's proxy", () => expect(() => assertSameOrigin(req("POST", { host: "app.internal", "x-forwarded-host": "dev.yasakia.com", origin: "https://dev.yasakia.com" }))).not.toThrow());
  it("refuses another origin", () => expect(() => assertSameOrigin(req("POST", { host: "dev.yasakia.com", origin: "https://evil.example" }))).toThrow());
  it("refuses a write with neither Origin nor a same-origin fetch metadata", () => expect(() => assertSameOrigin(req("DELETE", { host: "dev.yasakia.com" }))).toThrow());
  it("accepts a same-origin fetch without Origin", () => expect(() => assertSameOrigin(req("DELETE", { host: "dev.yasakia.com", "sec-fetch-site": "same-origin" }))).not.toThrow());
});
