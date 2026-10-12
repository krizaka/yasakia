import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { photoWidth } from "./limits";
import { signBunnyUrl, signLocalMediaUrl, signUpload, verifyLocalMediaToken, verifyUpload } from "./signing";

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);

describe("Bunny token authentication", () => {
  it("signs key + path + expires + the sorted parameters (SHA-256, URL-safe base64), valid 300 s", () => {
    const { url, expires } = signBunnyUrl({ hostname: "yazakia.b-cdn.net", path: "/photos/a/b.jpg", tokenKey: "secret-key", params: { width: 640 }, now: NOW });
    expect(expires).toBe(NOW / 1000 + 300);
    const expected = crypto.createHash("sha256").update(`secret-key/photos/a/b.jpg${expires}width=640`).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    expect(url).toBe(`https://yazakia.b-cdn.net/photos/a/b.jpg?token=${expected}&width=640&expires=${expires}`);
  });

  it("a different width is a different token (the size is signed)", () => {
    const a = signBunnyUrl({ hostname: "h", path: "/k.jpg", tokenKey: "k", params: { width: 320 }, now: NOW });
    const b = signBunnyUrl({ hostname: "h", path: "/k.jpg", tokenKey: "k", params: { width: 640 }, now: NOW });
    expect(new URL(a.url).searchParams.get("token")).not.toBe(new URL(b.url).searchParams.get("token"));
  });
});

describe("local media URLs (development storage)", () => {
  it("verifies its own signature, refuses another width, another key, an expired one", () => {
    const { url, expires } = signLocalMediaUrl({ baseUrl: "http://localhost:3000/", key: "photos/a/b.jpg", width: 640, secret: "s", now: NOW });
    const token = new URL(url).searchParams.get("token")!;
    expect(url.startsWith("http://localhost:3000/api/media/photos/a/b.jpg?width=640&expires=")).toBe(true);
    expect(verifyLocalMediaToken({ key: "photos/a/b.jpg", width: 640, expires, token, secret: "s", now: NOW })).toBe(true);
    expect(verifyLocalMediaToken({ key: "photos/a/b.jpg", width: 1280, expires, token, secret: "s", now: NOW })).toBe(false);
    expect(verifyLocalMediaToken({ key: "photos/a/c.jpg", width: 640, expires, token, secret: "s", now: NOW })).toBe(false);
    expect(verifyLocalMediaToken({ key: "photos/a/b.jpg", width: 640, expires, token, secret: "s", now: NOW + 301_000 })).toBe(false);
  });
});

describe("upload URLs", () => {
  it("open one photo for 300 s", () => {
    const { signature, expires } = signUpload({ photoId: "p1", secret: "s", now: NOW });
    expect(verifyUpload({ photoId: "p1", expires, signature, secret: "s", now: NOW })).toBe(true);
    expect(verifyUpload({ photoId: "p2", expires, signature, secret: "s", now: NOW })).toBe(false);
    expect(verifyUpload({ photoId: "p1", expires: expires + 1, signature, secret: "s", now: NOW })).toBe(false);
    expect(verifyUpload({ photoId: "p1", expires, signature, secret: "other", now: NOW })).toBe(false);
    expect(verifyUpload({ photoId: "p1", expires, signature, secret: "s", now: NOW + 301_000 })).toBe(false);
  });
});

describe("photo widths", () => {
  it("snap to a closed list (the CDN caches a handful of variants)", () => {
    expect(photoWidth(undefined)).toBe(640);
    expect(photoWidth(1)).toBe(160);
    expect(photoWidth(500)).toBe(640);
    expect(photoWidth(640)).toBe(640);
    expect(photoWidth(99999)).toBe(1280);
    expect(photoWidth(-3)).toBe(640);
  });
});
