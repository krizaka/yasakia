import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createOrazakaProvider } from "./orazaka";
import { AiFailure, AiUnavailableError } from "./provider.types";

let server: http.Server | undefined;
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

interface Seen {
  method: string;
  url: string;
  body: Buffer;
}
async function engine(handler: (req: Seen, res: http.ServerResponse) => void): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const s = { method: req.method ?? "", url: req.url ?? "", body: Buffer.concat(chunks) };
      seen.push(s);
      handler(s, res);
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/edge`, seen };
}
const options = (url: string, extra: Record<string, unknown> = {}) => ({ url, key: "oz_test", chatTimeoutMs: 2000, embedTimeoutMs: 2000, photoCheckPollMs: 10, mediaSafetyTimeoutMs: 3000, ...extra });
const report = (verdict: string, extra: Record<string, unknown> = {}) => ({ rulesetId: "media-safety", rulesetVersion: "2026-10-17", rulesetRevision: 1, verdict, blockers: [], findings: [], examined: { frames: 1, speech: false }, unreadable: 0, limits: ["FAILS_CLOSED_WHEN_UNREADABLE"], ...extra });
const run = (status: string, outputs: unknown[] = []) => JSON.stringify({ id: "run-s", status, outputs, errorMessage: null, steps: [] });
let n = 0;
const happy = (value: unknown) => (req: Seen, res: http.ServerResponse) => {
  if (req.url.endsWith("/media/upload")) res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ assetId: `asset-${++n}` }));
  else if (req.url.endsWith("/studios/media-safety/runs")) res.writeHead(200).end(run("RUNNING"));
  else if (req.method === "DELETE") res.writeHead(204).end();
  else res.writeHead(200).end(run("SUCCEEDED", [{ key: "report", type: "JSON", value: JSON.stringify(value) }]));
};
const frames = [Buffer.from("f0"), Buffer.from("f1"), Buffer.from("f2")];

describe("moderateMedia", () => {
  it("uploads the frames, runs media-safety on them and returns the verdict as codes; then takes every asset back", async () => {
    const { url, seen } = await engine(happy(report("APPROVED", { examined: { frames: 3, speech: false } })));
    const result = await createOrazakaProvider(options(url)).moderateMedia({ frames });
    expect(result.report.verdict).toBe("APPROVED");
    const start = JSON.parse(seen.find((s) => s.url.endsWith("/studios/media-safety/runs"))!.body.toString()).inputs;
    expect(start).toMatchObject({ frameCount: 3, expectsSpeech: false });
    expect(start.frames).toHaveLength(3);
    expect(start.audio).toBeUndefined();
    expect(seen.filter((s) => s.method === "DELETE")).toHaveLength(3);
  });

  it("a voice message goes as its own asset, with expectsSpeech", async () => {
    const { url, seen } = await engine(happy(report("REJECTED", { blockers: ["THREAT_OR_HARASSMENT"], findings: [{ code: "THREAT_OR_HARASSMENT", frame: null }], examined: { frames: 0, speech: true } })));
    const result = await createOrazakaProvider(options(url)).moderateMedia({ frames: [], audio: { bytes: Buffer.from("voice"), mime: "audio/mp4" } });
    expect(result.report).toMatchObject({ verdict: "REJECTED", blockers: ["THREAT_OR_HARASSMENT"] });
    const start = JSON.parse(seen.find((s) => s.url.endsWith("/studios/media-safety/runs"))!.body.toString()).inputs;
    expect(start).toMatchObject({ frameCount: 0, expectsSpeech: true, frames: [] });
    expect(typeof start.audio).toBe("string");
    expect(seen.filter((s) => s.method === "DELETE")).toHaveLength(1);
  });

  it("an UNREADABLE verdict is returned as such — the caller holds the media, nothing here turns it into a pass", async () => {
    const { url } = await engine(happy(report("UNREADABLE", { unreadable: 1 })));
    expect((await createOrazakaProvider(options(url)).moderateMedia({ frames })).report.verdict).toBe("UNREADABLE");
  });

  it("an engine that fails or times out is an error — never an approval", async () => {
    const failing = await engine((req, res) => {
      if (req.url.endsWith("/media/upload")) res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ assetId: "a" }));
      else if (req.method === "DELETE") res.writeHead(204).end();
      else res.writeHead(200).end(run(req.url.endsWith("/runs") ? "RUNNING" : "FAILED"));
    });
    const error = await createOrazakaProvider(options(failing.url)).moderateMedia({ frames }).catch((e) => e);
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect(error.code).toBe(AiFailure.Unreachable);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    const slow = await engine((req, res) => (req.url.endsWith("/media/upload") ? res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ assetId: "a" })) : res.writeHead(200).end(run("RUNNING"))));
    expect(await createOrazakaProvider(options(slow.url, { mediaSafetyTimeoutMs: 120 })).moderateMedia({ frames }).catch((e) => e.code)).toBe(AiFailure.Unreachable);
  });

  it("refuses a report that is off-contract (an unknown code, a missing verdict)", async () => {
    for (const bad of [report("APPROVED", { blockers: ["NEW_CODE"] }), { verdict: "APPROVED" }]) {
      const { url } = await engine(happy(bad));
      const error = await createOrazakaProvider(options(url)).moderateMedia({ frames }).catch((e) => e);
      expect(error.code).toBe(AiFailure.BadResponse);
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it("takes pictures or a sound, not nothing, and at most eight pictures", async () => {
    const { url } = await engine(happy(report("APPROVED")));
    const provider = createOrazakaProvider(options(url));
    await expect(provider.moderateMedia({ frames: [] })).rejects.toThrow();
    await expect(provider.moderateMedia({ frames: Array.from({ length: 9 }, () => Buffer.from("x")) })).rejects.toThrow();
  });
});
