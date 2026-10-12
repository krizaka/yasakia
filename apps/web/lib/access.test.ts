import { describe, expect, it } from "vitest";

import { photoAccess, type PhotoAccessInput } from "./access";

const base: PhotoAccessInput = {
  viewerId: "viewer",
  ownerId: "owner",
  ownerStatus: "ACTIVE",
  moderationStatus: "APPROVED",
  blocked: false,
  inCurrentBatch: false,
  liveIntro: false,
};

describe("who may see a photo", () => {
  it("the owner sees their photos, approved or not — but not one whose bytes never arrived", () => {
    for (const status of ["PENDING", "APPROVED", "REJECTED"] as const) expect(photoAccess({ ...base, viewerId: "owner", moderationStatus: status })).toEqual({ allowed: true, as: "owner" });
    expect(photoAccess({ ...base, viewerId: "owner", moderationStatus: "UPLOADING" }).allowed).toBe(false);
  });

  it("someone else needs a current batch or a live intro", () => {
    expect(photoAccess(base)).toEqual({ allowed: false, reason: "NO_RELATIONSHIP" });
    expect(photoAccess({ ...base, inCurrentBatch: true })).toEqual({ allowed: true, as: "batch" });
    expect(photoAccess({ ...base, liveIntro: true })).toEqual({ allowed: true, as: "intro" });
  });

  it("a block wins over everything", () => {
    expect(photoAccess({ ...base, inCurrentBatch: true, liveIntro: true, blocked: true })).toEqual({ allowed: false, reason: "BLOCKED" });
  });

  it("an unapproved photo, or a suspended owner, is shown to nobody else", () => {
    for (const status of ["PENDING", "REJECTED"] as const) expect(photoAccess({ ...base, inCurrentBatch: true, moderationStatus: status }).allowed).toBe(false);
    expect(photoAccess({ ...base, inCurrentBatch: true, ownerStatus: "SUSPENDED" })).toEqual({ allowed: false, reason: "SUSPENDED" });
  });

  it("a paused owner stays visible in the batches already open", () => {
    expect(photoAccess({ ...base, inCurrentBatch: true, ownerStatus: "PAUSED" }).allowed).toBe(true);
  });
});
