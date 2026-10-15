import { describe, expect, it } from "vitest";

import { adminActionRefusal } from "./admin-users";
import { budgetLimit, budgetShare } from "./operations";

const user = { id: "u", role: "USER" as const };
const admin = { id: "a", role: "ADMIN" as const };

describe("what an operator may do to an account", () => {
  it("never to their own", () => {
    for (const action of ["revoke", "role", "delete"] as const) expect(adminActionRefusal(action, "a", admin, 3, "USER")).toBe("SELF");
  });
  it("lets an operator end the sessions of anyone else, an administrator included", () => {
    expect(adminActionRefusal("revoke", "x", admin, 1)).toBeNull();
    expect(adminActionRefusal("revoke", null, user, 0)).toBeNull();
  });
  it("keeps the last administrator", () => {
    expect(adminActionRefusal("role", "x", admin, 1, "USER")).toBe("LAST_ADMIN");
    expect(adminActionRefusal("role", "x", admin, 2, "USER")).toBeNull();
    expect(adminActionRefusal("role", "x", user, 1, "ADMIN")).toBeNull();
  });
  it("erases a person, never an administrator (withdraw the role first)", () => {
    expect(adminActionRefusal("delete", "x", user, 2)).toBeNull();
    expect(adminActionRefusal("delete", "x", admin, 2)).toBe("TARGET_IS_ADMIN");
  });
});

describe("the database budget", () => {
  it("is the role's own limit when it has one, else the server's", () => {
    expect(budgetLimit(22, 100)).toBe(22);
    expect(budgetLimit(-1, 100)).toBe(100);
    expect(budgetLimit(500, 100)).toBe(100);
  });
  it("shares what is used, capped, 0 without a budget", () => {
    expect(budgetShare(5, 20)).toBe(0.25);
    expect(budgetShare(30, 20)).toBe(1);
    expect(budgetShare(3, 0)).toBe(0);
  });
});
