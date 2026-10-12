import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { EncryptionKeyError, isSealed, keyFromSecret, open, openJson, seal, sealJson } from "./crypto";

const KEY = crypto.randomBytes(32).toString("base64");
const env = { DATA_ENCRYPTION_KEY: KEY };

describe("encryption at rest", () => {
  it("opens what it sealed, in the same context", () => {
    const sealed = seal("ne veut pas d'enfants", "facets:a:children", env);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("enfants");
    expect(open(sealed, "facets:a:children", env)).toBe("ne veut pas d'enfants");
  });

  it("uses a fresh nonce every time", () => {
    expect(seal("same", "ctx", env)).not.toBe(seal("same", "ctx", env));
  });

  it("binds a value to its row and column: another context does not open it", () => {
    const sealed = seal("secret", "facets:a:children", env);
    expect(() => open(sealed, "facets:b:children", env)).toThrow();
  });

  it("refuses a value that was altered", () => {
    const sealed = seal("secret", "ctx", env);
    const body = sealed.slice(0, -2) + (sealed.endsWith("AA") ? "BB" : "AA");
    expect(() => open(body, "ctx", env)).toThrow();
  });

  it("refuses another key", () => {
    const sealed = seal("secret", "ctx", env);
    expect(() => open(sealed, "ctx", { DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64") })).toThrow(EncryptionKeyError);
  });

  it("rotates: values sealed with a previous key still open, new ones use the new key", () => {
    const old = seal("before", "ctx", env);
    const next = { DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"), DATA_ENCRYPTION_KEYS_PREVIOUS: KEY };
    expect(open(old, "ctx", next)).toBe("before");
    const fresh = seal("after", "ctx", next);
    expect(() => open(fresh, "ctx", env)).toThrow(EncryptionKeyError);
  });

  it("is mandatory in production, derived only outside it", () => {
    expect(() => seal("x", "ctx", { NODE_ENV: "production" })).toThrow(/DATA_ENCRYPTION_KEY is required in production/);
    expect(open(seal("x", "ctx", { NODE_ENV: "development" }), "ctx", { NODE_ENV: "test" })).toBe("x");
  });

  it("takes 32 bytes in base64 as they are, hashes a long passphrase, refuses a short one", () => {
    expect(keyFromSecret(KEY)).toEqual(Buffer.from(KEY, "base64"));
    expect(keyFromSecret("x".repeat(40))).toHaveLength(32);
    expect(() => keyFromSecret("short")).toThrow(EncryptionKeyError);
  });

  it("seals JSON values", () => {
    const value = { smokes: false, kids: ["no"] };
    expect(openJson(sealJson(value, "facets:a:lifestyle", env), "facets:a:lifestyle", env)).toEqual(value);
  });
});
