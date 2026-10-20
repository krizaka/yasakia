import { describe, expect, it } from "vitest";

import { decisionRecipients, mediaAccess, type MediaAccessInput, visibleMedia } from "./intro-media-rules";

const base: MediaAccessInput = { viewerIsSender: false, status: "APPROVED", introState: "OPEN", frozen: false, expired: false };

describe("who may see a media message — the sender always their own while it exists, the other only once it passed the safety check", () => {
  it("the other person sees an APPROVED media of a live conversation", () => expect(mediaAccess(base)).toEqual({ allowed: true, as: "recipient" }));
  it("…and an OPEN one that was continued", () => expect(mediaAccess({ ...base, introState: "CONTINUED" }).allowed).toBe(true));
  it("the other person never sees what is uploading, waiting for the check, refused or gone — it does not exist for them", () => {
    for (const status of ["UPLOADING", "PENDING", "REJECTED", "GONE"] as const) expect(mediaAccess({ ...base, status })).toEqual({ allowed: false, reason: "NOT_APPROVED" });
  });
  it("the sender sees their own while its bytes exist (uploading, waiting, approved), not once refused or gone", () => {
    for (const status of ["UPLOADING", "PENDING", "APPROVED"] as const) expect(mediaAccess({ ...base, viewerIsSender: true, status }).allowed).toBe(true);
    for (const status of ["REJECTED", "GONE"] as const) expect(mediaAccess({ ...base, viewerIsSender: true, status })).toEqual({ allowed: false, reason: "GONE" });
  });
  it("expiry follows the conversation: faded, closed, frozen or past its days, nobody opens it", () => {
    for (const introState of ["FADED", "CLOSED"] as const) expect(mediaAccess({ ...base, introState }).allowed).toBe(false);
    expect(mediaAccess({ ...base, frozen: true })).toEqual({ allowed: false, reason: "CONVERSATION_ENDED" });
    expect(mediaAccess({ ...base, expired: true })).toEqual({ allowed: false, reason: "CONVERSATION_ENDED" });
    expect(mediaAccess({ ...base, viewerIsSender: true, introState: "FADED" })).toEqual({ allowed: false, reason: "CONVERSATION_ENDED" });
  });
  it("a continued conversation has no end", () => expect(mediaAccess({ ...base, introState: "CONTINUED", expired: true }).allowed).toBe(true));
});

describe("visibleMedia — what a thread shows each person", () => {
  const row = (sender: string, status: string) => ({ senderId: sender, status });
  it("the recipient reads only approved media; the sender reads their own with its state", () => {
    expect(visibleMedia("b", row("a", "PENDING"))).toBe(false);
    expect(visibleMedia("b", row("a", "APPROVED"))).toBe(true);
    expect(visibleMedia("a", row("a", "PENDING"))).toBe(true);
    expect(visibleMedia("a", row("a", "GONE"))).toBe(false);
    expect(visibleMedia("a", row("a", "REJECTED"))).toBe(true); // the sender learns why
    expect(visibleMedia("b", row("a", "REJECTED"))).toBe(false); // the other person never knew
  });
});

// Found recording the take: once the safety check approved a photo, the sender's own thread kept saying « only you can see it »
// until a reload — only the other person was told. Both are told of an approval; the sender alone of a refusal.
describe("who is told of a safety decision", () => {
  const row = { senderId: "a", accountA: "a", accountB: "b" };
  it("tells both people of an approval, the other first", () => {
    expect(decisionRecipients("APPROVED", row)).toEqual(["b", "a"]);
    expect(decisionRecipients("APPROVED", { senderId: "b", accountA: "a", accountB: "b" })).toEqual(["a", "b"]);
  });
  it("tells only the sender of a refusal, and nobody of a held one", () => {
    expect(decisionRecipients("REJECTED", row)).toEqual(["a"]);
    expect(decisionRecipients("UNREADABLE", row)).toEqual([]);
  });
});
