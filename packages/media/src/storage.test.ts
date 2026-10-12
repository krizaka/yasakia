import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { photoModeration } from "./moderation";
import { bunnyStorage, checkKey, localStorage } from "./storage";

describe("storage keys", () => {
  it("are the server's, never a path a client could shape", () => {
    expect(checkKey("photos/a/b.jpg")).toBe("photos/a/b.jpg");
    for (const bad of ["../etc/passwd", "/abs", "photos//x", "photos/../../x", "Photos/A.jpg", ""]) expect(() => checkKey(bad)).toThrow();
  });
});

describe("local storage", () => {
  it("writes, reads, deletes (a missing object is null, deleting it again is fine)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yazakia-media-"));
    const storage = localStorage(dir);
    await storage.put("photos/a/b.jpg", Buffer.from("bytes"), "image/jpeg");
    expect((await storage.get("photos/a/b.jpg"))?.toString()).toBe("bytes");
    await storage.delete("photos/a/b.jpg");
    await storage.delete("photos/a/b.jpg");
    expect(await storage.get("photos/a/b.jpg")).toBeNull();
  });
});

describe("Bunny storage", () => {
  it("talks to the zone's HTTP API with its AccessKey; 404 is null on read and fine on delete", async () => {
    const calls: { url: string; method: string; key: string | null }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", key: new Headers(init?.headers).get("AccessKey") });
      return new Response(init?.method === "PUT" ? "{}" : null, { status: init?.method === "PUT" ? 201 : 404 });
    }) as unknown as typeof fetch;
    const storage = bunnyStorage({ zone: "yazakia", apiKey: "k", endpoint: "storage.bunnycdn.com" }, fake);
    await storage.put("photos/a/b.jpg", Buffer.from("x"), "image/jpeg");
    expect(await storage.get("photos/a/b.jpg")).toBeNull();
    await storage.delete("photos/a/b.jpg");
    expect(calls.map((c) => `${c.method} ${c.url} ${c.key}`)).toEqual([
      "PUT https://storage.bunnycdn.com/yazakia/photos/a/b.jpg k",
      "GET https://storage.bunnycdn.com/yazakia/photos/a/b.jpg k",
      "DELETE https://storage.bunnycdn.com/yazakia/photos/a/b.jpg k",
    ]);
  });

  it("an outage is an error, never a silent success", async () => {
    const storage = bunnyStorage({ zone: "z", apiKey: "k", endpoint: "e" }, (async () => new Response(null, { status: 503 })) as unknown as typeof fetch);
    await expect(storage.delete("photos/a.jpg")).rejects.toThrow(/503/);
  });
});

describe("photo moderation", () => {
  it("V1 approves automatically; any other moderation is refused until it exists", async () => {
    expect(await photoModeration(undefined).review({ id: "p", accountId: "a", width: 1, height: 1, body: Buffer.alloc(0) })).toBe("APPROVED");
    expect(() => photoModeration("vision")).toThrow(/PHOTO_MODERATION/);
  });
});
