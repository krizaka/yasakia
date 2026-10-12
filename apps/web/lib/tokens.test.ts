import { describe, expect, it } from "vitest";

import { bearerToken, generateCode, hashCode, normaliseEmail, sameHash, SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from "./tokens";

const SECRET = "test-secret-0123456789abcdef0123456789";
const NOW = Date.UTC(2026, 9, 11);

describe("session tokens", () => {
  it("carry the account and the session version, signed", () => {
    const token = signSessionToken("acc-1", 3, SECRET, NOW);
    expect(token.startsWith("yz1.")).toBe(true);
    expect(verifySessionToken(token, SECRET, NOW)).toEqual({ sub: "acc-1", v: 3, exp: NOW / 1000 + SESSION_TTL_SECONDS });
  });

  it("refuse another secret, a changed payload, an expired token, a malformed one", () => {
    const token = signSessionToken("acc-1", 1, SECRET, NOW);
    expect(verifySessionToken(token, `${SECRET}x`, NOW)).toBeNull();
    const [prefix, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "acc-2", v: 1, exp: 9999999999 })).toString("base64url");
    expect(verifySessionToken(`${prefix}.${forged}.${signature}`, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(token, SECRET, NOW + SESSION_TTL_SECONDS * 1000)).toBeNull();
    expect(verifySessionToken("yz1.abc", SECRET, NOW)).toBeNull();
    expect(verifySessionToken(`xx1.${token.split(".").slice(1).join(".")}`, SECRET, NOW)).toBeNull();
  });

  it("are read from `Authorization: Bearer` only", () => {
    const token = signSessionToken("a", 1, SECRET, NOW);
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(bearerToken(token)).toBeUndefined();
    expect(bearerToken(null)).toBeUndefined();
    expect(bearerToken("Bearer not.a.token!")).toBeUndefined();
  });
});

describe("sign-in codes", () => {
  it("are 6 digits", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("are kept as a keyed hash bound to the address", () => {
    const hash = hashCode("ada@example.com", "123456", SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sameHash(hash, hashCode("ada@example.com", "123456", SECRET))).toBe(true);
    expect(sameHash(hash, hashCode("bea@example.com", "123456", SECRET))).toBe(false);
    expect(sameHash(hash, hashCode("ada@example.com", "123457", SECRET))).toBe(false);
    expect(sameHash(hash, "00")).toBe(false);
  });

  it("addresses are compared lower-cased and trimmed", () => {
    expect(normaliseEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });
});
