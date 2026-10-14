import { describe, expect, it } from "vitest";

import { hashPassword, passwordProblem, verifyPassword } from "./password";

describe("passwords", () => {
  it("verifies the right password and refuses a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password, twice")).not.toBe(await hashPassword("same password, twice"));
  });

  it("refuses a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("anything at all 123", "not-a-hash")).toBe(false);
  });

  it("asks for a long, varied password", () => {
    expect(passwordProblem("short")).toBe("TOO_SHORT");
    expect(passwordProblem("aaaaaaaaaaaaaaaa")).toBe("TOO_SIMPLE");
    expect(passwordProblem("x".repeat(300))).toBe("TOO_LONG");
    expect(passwordProblem("a long enough passphrase")).toBeNull();
  });
});
