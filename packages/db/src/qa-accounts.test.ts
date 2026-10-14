import { describe, expect, it } from "vitest";

import { qaAccounts } from "./qa-accounts";

describe("QA accounts", () => {
  const ok = { QA_USER_PASSWORD: "a long enough passphrase", QA_ADMIN_PASSWORD: "another long passphrase" };
  it("makes one person and one administrator at qa+ addresses", () => {
    const [user, admin] = qaAccounts(ok);
    expect([user.email, user.role]).toEqual(["qa+user@yasakia.com", "USER"]);
    expect([admin.email, admin.role]).toEqual(["qa+admin@yasakia.com", "ADMIN"]);
  });
  it("refuses a weak or missing password", () => {
    expect(() => qaAccounts({ ...ok, QA_USER_PASSWORD: "short" })).toThrow(/not acceptable/);
    expect(() => qaAccounts({ QA_USER_PASSWORD: ok.QA_USER_PASSWORD })).toThrow(/not acceptable/);
  });
  it("can never aim at a real person's address", () => {
    expect(() => qaAccounts({ ...ok, QA_ADMIN_EMAIL: "someone@example.com" })).toThrow(/qa\+/);
  });
});
