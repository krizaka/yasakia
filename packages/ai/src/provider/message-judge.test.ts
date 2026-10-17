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
  body: string;
}
async function engine(handler: (req: Seen, res: http.ServerResponse) => void): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const s = { method: req.method ?? "", url: req.url ?? "", body };
      seen.push(s);
      handler(s, res);
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/edge`, seen };
}
const options = (url: string, extra: Record<string, unknown> = {}) => ({ url, key: "oz_test", chatTimeoutMs: 2000, embedTimeoutMs: 2000, photoCheckPollMs: 10, ...extra });
const run = (status: string, outputs: unknown[] = []) => JSON.stringify({ id: "run-9", status, outputs, errorMessage: null, steps: [] });
const report = { detector: "HIGH", language: "fr", rulesetVersion: "2026-10-17", limits: ["CAN_BE_WRONG"] };
const answers = (value: unknown) => (req: Seen, res: http.ServerResponse) => {
  if (req.url.endsWith("/studios/message-authenticity/runs")) res.writeHead(200).end(run("RUNNING"));
  else res.writeHead(200).end(run("SUCCEEDED", [{ key: "report", type: "JSON", value: typeof value === "string" ? value : JSON.stringify(value) }]));
};

describe("judgeMessage", () => {
  it("runs the message-authenticity Studio on the text and returns a coarse level — never a number", async () => {
    const { url, seen } = await engine(answers(report));
    const result = await createOrazakaProvider(options(url)).judgeMessage({ text: "Salut ! Tu connais le sentier derrière le mont Royal ?", locale: "fr" });
    expect(result).toMatchObject({ runId: "run-9", report: { detector: "HIGH", language: "fr" } });
    expect(JSON.parse(seen[0].body)).toEqual({ inputs: { text: "Salut ! Tu connais le sentier derrière le mont Royal ?", locale: "fr" } });
    expect(JSON.stringify(result)).not.toMatch(/score|probab|confidence/i);
  });

  it("refuses an answer that carries a score, a level it does not know, or a field it never asked for (the contract is closed)", async () => {
    for (const bad of [{ ...report, score: 0.93 }, { ...report, detector: "VERY_HIGH" }, "not json"]) {
      const { url } = await engine(answers(bad));
      const error = await createOrazakaProvider(options(url)).judgeMessage({ text: "un texte assez long pour être jugé par le moteur", locale: "fr" }).catch((e) => e);
      expect(error).toBeInstanceOf(AiUnavailableError);
      expect(error.code).toBe(AiFailure.BadResponse);
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it("gives up inside its own short time: a signal never makes a message wait", async () => {
    const { url } = await engine((_req, res) => res.writeHead(200).end(run("RUNNING")));
    const started = Date.now();
    const error = await createOrazakaProvider(options(url, { messageJudgeTimeoutMs: 120 })).judgeMessage({ text: "x ".repeat(20), locale: "en" }).catch((e) => e);
    expect(error.code).toBe(AiFailure.Unreachable);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("takes a text, not nothing", async () => {
    const { url } = await engine(answers(report));
    await expect(createOrazakaProvider(options(url)).judgeMessage({ text: "   ", locale: "en" })).rejects.toThrow();
  });
});
