import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { signMessageMediaUrl, signMessageUpload, verifyMessageUpload } from "./media";

const bunny = { driver: "bunny", zone: "yasakia-dev", apiKey: "x", endpoint: "storage.example", pullZoneHostname: "yasakia-dev.b-cdn.net", tokenKey: "token-key-for-tests" } as const;

describe("a media message is read through a signed URL — 300 seconds, one file, one reader", () => {
  it("a Bunny URL carries the pull zone's token for exactly that path, with no size parameter, and expires in 300 s", () => {
    const now = Math.floor(Date.now() / 1000);
    const signed = signMessageMediaUrl("messages/intro-1/msg-1.mp4", bunny);
    const url = new URL(signed.url);
    expect(url.host).toBe("yasakia-dev.b-cdn.net");
    expect(url.pathname).toBe("/messages/intro-1/msg-1.mp4");
    expect(url.searchParams.has("width")).toBe(false);
    const expires = Number(url.searchParams.get("expires"));
    expect(expires - now).toBeGreaterThanOrEqual(299);
    expect(expires - now).toBeLessThanOrEqual(301);
    const expected = crypto.createHash("sha256").update(`${bunny.tokenKey}/messages/intro-1/msg-1.mp4${expires}`).digest("base64").replace(/\n/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    expect(url.searchParams.get("token")).toBe(expected);
    expect(new Date(signed.expiresAt).getTime() / 1000).toBeCloseTo(expires, 0);
  });

  it("the token is for one file: another path gets another token", () => {
    const a = new URL(signMessageMediaUrl("messages/i/a.mp4", bunny).url).searchParams.get("token");
    const b = new URL(signMessageMediaUrl("messages/i/b.mp4", bunny).url).searchParams.get("token");
    expect(a).not.toBe(b);
  });

  it("no media URL on a deployment without storage — nothing is faked", () => {
    expect(() => signMessageMediaUrl("messages/i/a.mp4", { driver: "none" })).toThrow(/MEDIA_STORAGE_PROVIDER/);
  });
});

describe("the upload URL of a media message", () => {
  it("is signed for that message: its own signature opens it, another message's or a mangled one opens nothing", () => {
    const { url } = signMessageUpload("11111111-1111-4111-8111-111111111111");
    const q = new URL(url).searchParams;
    expect(url).toContain("/api/uploads/messages/11111111-1111-4111-8111-111111111111?");
    const expires = Number(q.get("expires"));
    expect(verifyMessageUpload("11111111-1111-4111-8111-111111111111", expires, q.get("signature")!)).toBe(true);
    expect(verifyMessageUpload("22222222-2222-4222-8222-222222222222", expires, q.get("signature")!)).toBe(false);
    expect(verifyMessageUpload("11111111-1111-4111-8111-111111111111", expires + 1, q.get("signature")!)).toBe(false);
    expect(verifyMessageUpload("11111111-1111-4111-8111-111111111111", expires, "AAAA")).toBe(false);
  });

  it("a photo's upload signature does not open a message upload (separate keys)", async () => {
    const { signPhotoUpload } = await import("./media");
    const photo = new URL(signPhotoUpload("11111111-1111-4111-8111-111111111111").url).searchParams;
    expect(verifyMessageUpload("11111111-1111-4111-8111-111111111111", Number(photo.get("expires")), photo.get("signature")!)).toBe(false);
  });
});
