import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createOrazakaProvider, sseData } from "./orazaka";
import { AiFailure, AiUnavailableError } from "./provider.types";

const sse = (...tokens: string[]) =>
  `id:c1\nevent:pipeline-ack\ndata:{"pipelineId":"default"}\n\n${tokens.map((t) => `id:c1\nevent:message\ndata:${JSON.stringify({ content: t })}\n\n`).join("")}`;

interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
  body: string;
}

let server: http.Server | undefined;
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

/** A stand-in for Orazaka's edge with the same contract: bearer `oz_` key, SSE chat, OpenAI-shaped embeddings. */
async function engine(handler: (req: Seen, res: http.ServerResponse) => void): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const s = { method: req.method ?? "", url: req.url ?? "", authorization: req.headers.authorization, body };
      seen.push(s);
      handler(s, res);
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/edge`, seen };
}

const options = (url: string) => ({ url, key: "oz_test", chatTimeoutMs: 2000, embedTimeoutMs: 2000 });

describe("sseData", () => {
  it("returns the payloads of one event name, in order, ignoring the others", () => {
    expect(sseData(sse("Bon", "jour"), "message")).toEqual(['{"content":"Bon"}', '{"content":"jour"}']);
    expect(sseData(sse("x"), "pipeline-ack")).toEqual(['{"pipelineId":"default"}']);
  });
});

describe("chat", () => {
  it("collects the tokens of the stream, with the key, under the turn's conversation id, then forgets the turn", async () => {
    const { url, seen } = await engine((req, res) => {
      if (req.method === "POST") res.writeHead(200, { "content-type": "text/event-stream" }).end(sse("Bon", "jour ", "Camille"));
      else res.writeHead(204).end();
    });
    const result = await createOrazakaProvider(options(url)).chat({ conversationId: "turn-1", prompt: "Salut" });
    expect(result.text).toBe("Bonjour Camille");
    expect(result.conversationId).toBe("turn-1");
    expect(seen[0]).toMatchObject({ method: "POST", url: "/edge/api/v1/chat/stream/turn-1", authorization: "Bearer oz_test" });
    expect(JSON.parse(seen[0].body)).toEqual({ prompt: "Salut" });
    await expect.poll(() => seen.some((s) => s.method === "DELETE" && s.url === "/edge/api/v1/chat/sessions/turn-1")).toBe(true);
  });

  it("is bad_response when the stream carries no text", async () => {
    const { url } = await engine((_req, res) => res.writeHead(200).end(sse()));
    await expect(createOrazakaProvider(options(url)).chat({ conversationId: "t", prompt: "x" })).rejects.toMatchObject({ code: AiFailure.BadResponse });
  });

  it("is refused on a 403 and unreachable on a 503 — and never carries the engine's words", async () => {
    for (const [status, code] of [[403, AiFailure.Refused], [401, AiFailure.Refused], [503, AiFailure.Unreachable]] as const) {
      const { url } = await engine((_req, res) => res.writeHead(status).end("secret engine detail"));
      const error = await createOrazakaProvider(options(url)).chat({ conversationId: "t", prompt: "x" }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AiUnavailableError);
      expect((error as AiUnavailableError).code).toBe(code);
      expect((error as AiUnavailableError).message).not.toContain("secret engine detail");
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it("is unreachable when nothing listens, and not_configured without a key", async () => {
    await expect(createOrazakaProvider({ ...options("http://127.0.0.1:1/edge") }).chat({ conversationId: "t", prompt: "x" })).rejects.toMatchObject({ code: AiFailure.Unreachable });
    expect(() => createOrazakaProvider({ ...options("http://x"), key: " " })).toThrowError(expect.objectContaining({ code: AiFailure.NotConfigured }));
  });
});

describe("embed", () => {
  const answer = (n: number) => JSON.stringify({ runId: "run-1", model: "gte-large-en-v1.5", dimensions: 3, data: Array.from({ length: n }, (_, i) => ({ index: n - 1 - i, embedding: [i, 1, 2] })), usage: { promptTokens: 7 } });

  it("returns the vectors in the order of the texts, with the run id", async () => {
    const { url, seen } = await engine((_req, res) => res.writeHead(200, { "content-type": "application/json" }).end(answer(2)));
    const result = await createOrazakaProvider(options(url)).embed(["a", "b"]);
    expect(result).toMatchObject({ runId: "run-1", model: "gte-large-en-v1.5", dimensions: 3, promptTokens: 7 });
    expect(result.vectors).toEqual([[1, 1, 2], [0, 1, 2]]); // index 0 is the second entry sent back
    expect(JSON.parse(seen[0].body)).toEqual({ input: ["a", "b"] });
  });

  it("refuses an empty or blank batch before calling", async () => {
    const provider = createOrazakaProvider(options("http://127.0.0.1:1"));
    await expect(provider.embed([])).rejects.toThrow(/1 to 128/);
    await expect(provider.embed(["ok", " "])).rejects.toThrow(/non-blank/);
  });

  it("is bad_response on a wrong count or a ragged vector", async () => {
    const { url } = await engine((_req, res) => res.writeHead(200).end(answer(1)));
    await expect(createOrazakaProvider(options(url)).embed(["a", "b"])).rejects.toMatchObject({ code: AiFailure.BadResponse });
  });
});
