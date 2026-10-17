import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createOrazakaProvider } from "./orazaka";
import { PhotoCheckReport } from "./photo-check.types";
import { AiFailure, AiUnavailableError } from "./provider.types";

interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  contentType: string | undefined;
  body: Buffer;
}

let server: http.Server | undefined;
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

async function engine(handler: (req: Seen, res: http.ServerResponse) => void): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const s = { method: req.method ?? "", url: req.url ?? "", authorization: req.headers.authorization, contentType: req.headers["content-type"], body: Buffer.concat(chunks) };
      seen.push(s);
      handler(s, res);
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/edge`, seen };
}

const REPORT = {
  rulesetId: "profile-photo",
  rulesetVersion: "2026-10-17",
  rulesetRevision: 1,
  photos: [
    { index: 0, kind: "FACE", faceCount: 1, findings: [] },
    { index: 1, kind: "FACE", faceCount: 1, findings: [] },
    { index: 2, kind: "NO_FACE", faceCount: 0, findings: [{ code: "UNVERIFIED", severity: "INFO" }] },
    { index: 3, kind: "NO_FACE", faceCount: 0, findings: [] },
  ],
  identity: { status: "CONSISTENT", compared: 2 },
  counts: { photos: 4, facePhotos: 2, required: { minPhotos: 4, maxPhotos: 6, minFacePhotos: 2 } },
  passes: true,
  blockers: [],
  limits: ["NO_CELEBRITY_RECOGNITION"],
};

const run = (status: string, extra: Record<string, unknown> = {}) => JSON.stringify({ id: "run-1", studioKey: "profile-photo-check", status, outputs: [], errorMessage: null, steps: [], ...extra });
const done = run("SUCCEEDED", { outputs: [{ key: "report", label: "Verdict", type: "JSON", value: JSON.stringify(REPORT) }] });

let assetCount = 0;
const options = (url: string, extra: Record<string, unknown> = {}) => ({ url, key: "oz_test", chatTimeoutMs: 2000, embedTimeoutMs: 2000, photoCheckTimeoutMs: 3000, photoCheckPollMs: 10, ...extra });
const photos = [Buffer.from("jpeg-0"), Buffer.from("jpeg-1"), Buffer.from("jpeg-2"), Buffer.from("jpeg-3")];
const counts = { minPhotos: 4, maxPhotos: 6, minFacePhotos: 2 };

const inputsOf = (seen: Seen[]) => JSON.parse(seen.find((s) => s.url === "/edge/api/v1/studios/profile-photo-check/runs")!.body.toString()).inputs;

/** The engine of the happy path: assets are accepted, the run is RUNNING once, then done. */
function happy(polls = 1) {
  let seenRunning = 0;
  return (req: Seen, res: http.ServerResponse) => {
    if (req.url.endsWith("/media/upload")) {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ assetId: `asset-${++assetCount}`, filename: "p.jpg", contentType: "image/jpeg", sizeBytes: 6 }));
    } else if (req.url.endsWith("/studios/profile-photo-check/runs")) {
      res.writeHead(200, { "content-type": "application/json" }).end(run("RUNNING"));
    } else if (req.url.includes("/studios/runs/")) {
      res.writeHead(200, { "content-type": "application/json" }).end(++seenRunning > polls ? done : run("RUNNING"));
    } else res.writeHead(204).end(); // DELETE of an asset
  };
}

describe("checkPhotos", () => {
  it("uploads each thumbnail, runs the Studio with the assets, the same bytes and the product's counts, and returns the verdict as codes", async () => {
    const { url, seen } = await engine(happy(2));
    const result = await createOrazakaProvider(options(url)).checkPhotos({ photos, counts });
    expect(result.runId).toBe("run-1");
    expect(PhotoCheckReport.parse(result.report).passes).toBe(true);
    const uploads = seen.filter((s) => s.url === "/edge/api/v1/media/upload");
    expect(uploads).toHaveLength(4);
    expect(uploads.every((u) => u.authorization === "Bearer oz_test" && u.contentType?.startsWith("multipart/form-data"))).toBe(true);
    const start = seen.find((s) => s.url === "/edge/api/v1/studios/profile-photo-check/runs")!;
    const inputs = JSON.parse(start.body.toString()).inputs;
    expect(inputs.photos).toHaveLength(4);
    expect(inputs.photos.every((id: string) => id.startsWith("asset-"))).toBe(true);
    expect(inputs.photosBase64).toEqual(photos.map((p) => p.toString("base64")));
    expect(inputs).toMatchObject(counts);
    expect(seen.filter((s) => s.url === "/edge/api/v1/studios/runs/run-1").length).toBeGreaterThanOrEqual(3);
  });

  it("takes the thumbnails back as soon as the answer is in — every asset it uploaded is deleted, with the key", async () => {
    const { url, seen } = await engine(happy());
    await createOrazakaProvider(options(url)).checkPhotos({ photos, counts });
    const deleted = seen.filter((s) => s.method === "DELETE");
    expect(deleted.map((d) => d.url).sort()).toEqual(inputsOf(seen).photos.map((id: string) => `/edge/api/v1/media/assets/${id}`).sort());
    expect(deleted.every((d) => d.authorization === "Bearer oz_test")).toBe(true);
  });

  it("deletes them when the run fails or runs out of time too", async () => {
    const { url, seen } = await engine((req, res) => {
      if (req.url.endsWith("/media/upload")) res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ assetId: `a-${++assetCount}` }));
      else if (req.url.endsWith("/runs")) res.writeHead(200).end(run("RUNNING"));
      else if (req.method === "DELETE") res.writeHead(204).end();
      else res.writeHead(200).end(run("FAILED"));
    });
    await createOrazakaProvider(options(url)).checkPhotos({ photos, counts }).catch(() => undefined);
    await expect.poll(() => seen.filter((s) => s.method === "DELETE").length).toBe(4);
  });

  it("a deletion that fails does not fail the check (best effort — the run's own retention is the net)", async () => {
    const happyEngine = happy();
    const { url } = await engine((req, res) => (req.method === "DELETE" ? res.writeHead(500).end() : happyEngine(req, res)));
    await expect(createOrazakaProvider(options(url)).checkPhotos({ photos, counts })).resolves.toMatchObject({ runId: "run-1" });
  });

  it("is an unavailable engine when the run fails, never an answer", async () => {
    const { url } = await engine((req, res) => {
      if (req.url.endsWith("/media/upload")) res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ assetId: "a" }));
      else if (req.url.endsWith("/runs")) res.writeHead(200).end(run("RUNNING"));
      else res.writeHead(200).end(run("FAILED", { errorMessage: "com.openai.errors.OpenAIIoException: Request failed" }));
    });
    const error = await createOrazakaProvider(options(url)).checkPhotos({ photos, counts }).catch((e) => e);
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect(error.code).toBe(AiFailure.Unreachable);
    expect(error.message).not.toContain("OpenAI"); // the engine's words stay in its logs
  });

  it("gives up when the run does not end inside its time", async () => {
    const { url } = await engine((req, res) => {
      if (req.url.endsWith("/media/upload")) res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ assetId: "a" }));
      else res.writeHead(200).end(run("RUNNING"));
    });
    const error = await createOrazakaProvider(options(url, { photoCheckTimeoutMs: 150 })).checkPhotos({ photos, counts }).catch((e) => e);
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect(error.code).toBe(AiFailure.Unreachable);
  });

  it("refuses a report that is not the contract (a code it does not know, a missing field)", async () => {
    const bad = (value: unknown) =>
      engine((req, res) => {
        if (req.url.endsWith("/media/upload")) res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ assetId: "a" }));
        else if (req.url.endsWith("/runs")) res.writeHead(200).end(run("RUNNING"));
        else res.writeHead(200).end(run("SUCCEEDED", { outputs: [{ key: "report", type: "JSON", value: typeof value === "string" ? value : JSON.stringify(value) }] }));
      });
    for (const value of [{ ...REPORT, blockers: [{ code: "SOMETHING_NEW", photos: [] }] }, { passes: true }, "not json"]) {
      const { url } = await bad(value);
      const error = await createOrazakaProvider(options(url)).checkPhotos({ photos, counts }).catch((e) => e);
      expect(error, JSON.stringify(value)).toBeInstanceOf(AiUnavailableError);
      expect(error.code).toBe(AiFailure.BadResponse);
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it("refuses the engine's refusal of the key as a refusal", async () => {
    const { url } = await engine((_req, res) => res.writeHead(403).end("{}"));
    const error = await createOrazakaProvider(options(url)).checkPhotos({ photos, counts }).catch((e) => e);
    expect(error.code).toBe(AiFailure.Refused);
  });

  it("takes between one and twelve photos", async () => {
    const { url } = await engine(happy());
    const provider = createOrazakaProvider(options(url));
    await expect(provider.checkPhotos({ photos: [], counts })).rejects.toThrow();
    await expect(provider.checkPhotos({ photos: Array.from({ length: 13 }, () => Buffer.from("x")), counts })).rejects.toThrow();
  });
});
