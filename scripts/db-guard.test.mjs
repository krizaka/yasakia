import { describe, expect, it } from "vitest";

import { databaseForBranch, destructionRefusal, SHARED_DATABASE } from "./lib.mjs";

describe("one database per branch, destruction guarded", () => {
  it("a branch gets its own database; main keeps the shared one", () => {
    expect(databaseForBranch("main")).toBe(SHARED_DATABASE);
    expect(databaseForBranch(null)).toBe(SHARED_DATABASE);
    expect(databaseForBranch("feat/Photos-v2")).toBe("yasakia_feat_photos_v2");
    expect(databaseForBranch(`feat/${"x".repeat(100)}`)).toHaveLength(63);
  });

  it("reset and restore refuse the shared database and the demo databases", () => {
    expect(destructionRefusal("yasakia_db")).toMatch(/shared/);
    expect(destructionRefusal("yasakia_demo")).toMatch(/demo/);
    expect(destructionRefusal("yasakia_feat_photos")).toBeNull();
    expect(destructionRefusal("yasakia_e2e")).toBeNull();
  });
});
