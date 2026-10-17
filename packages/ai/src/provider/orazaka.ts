import { type MessageJudgeInput, MessageJudgeReport, type MessageJudgeResult } from "./message-judge.types";
import { type PhotoCheckInput, PhotoCheckReport, type PhotoCheckResult, RunStatus } from "./photo-check.types";
import { AiFailure, type AiProvider, AiUnavailableError, type ChatInput, type ChatResult, type EmbedResult, MAX_EMBED_BATCH } from "./provider.types";

export interface OrazakaOptions {
  /** The edge: `https://dev.orazaka.com/edge`. */
  url: string;
  /** The product's service key (`oz_…`). Never logged, never returned. */
  key: string;
  /** How long a chat turn may take, in milliseconds (a deployment setting, read by the caller). */
  chatTimeoutMs: number;
  /** How long an embedding call may take, in milliseconds. */
  embedTimeoutMs: number;
  /** How long a whole photo check (uploads, the Studio run, its answer) may take, in milliseconds. Default 180 000. */
  photoCheckTimeoutMs?: number;
  /** How long judging one message may take, in milliseconds. Default 30 000. */
  messageJudgeTimeoutMs?: number;
  /** How often a run is asked about, in milliseconds. Default 2 000. */
  photoCheckPollMs?: number;
  fetchImpl?: typeof fetch;
  /** The clock, injected (milliseconds). */
  now?: () => number;
}

const failure = (code: AiFailure, message: string): never => {
  throw new AiUnavailableError(code, message);
};

/** The `data:` payloads of the SSE events named `name`, in order. */
export function sseData(body: string, name: string): string[] {
  const out: string[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (event === name && data.length) out.push(data.join("\n"));
  }
  return out;
}

/**
 * Orazaka's adapter. A chat turn is `POST /api/v1/chat/stream/{conversationId}` (SSE: `message` events carry the
 * tokens); the turn's session is deleted afterwards so the engine keeps no memory of a person's words
 * (`DELETE /api/v1/chat/sessions/{id}`, best effort). Embeddings are `POST /api/v1/embeddings`.
 */
export function createOrazakaProvider(options: OrazakaOptions): AiProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const base = options.url.trim().replace(/\/+$/, "");
  if (!base || !options.key.trim()) throw new AiUnavailableError(AiFailure.NotConfigured, "Orazaka is not configured");
  const headers = { "content-type": "application/json", authorization: `Bearer ${options.key.trim()}` };

  const call = async (path: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> => {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const merged: Record<string, string> = { ...headers, ...(init.headers as Record<string, string> | undefined) };
      if (init.body instanceof FormData) delete merged["content-type"]; // fetch writes the multipart boundary itself
      return await doFetch(`${base}${path}`, { ...init, headers: merged, signal: signal ? AbortSignal.any([timeout, signal]) : timeout, cache: "no-store" });
    } catch {
      // A network error can name the host, never the key; the type is all a caller needs.
      return failure(AiFailure.Unreachable, "Orazaka did not answer");
    }
  };
  const refusal = (response: Response) => failure(response.status >= 500 ? AiFailure.Unreachable : AiFailure.Refused, `Orazaka answered ${response.status}`);

  /**
   * Runs one of Orazaka's Studios (`POST /api/v1/studios/{key}/runs`) and asks about the run until it ends, within `deadline`.
   * Returns the run's id (the proof of use) and the JSON its `report` output carries. The engine's own words (a model's error, a
   * stack) stay in its logs: the product only learns that the engine was out of reach, or answered off-contract.
   */
  async function runStudio(studio: string, inputs: Record<string, unknown>, deadline: number, signal?: AbortSignal): Promise<{ runId: string; report: unknown }> {
    const pollEvery = options.photoCheckPollMs ?? 2_000; // @fixed: a poll every two seconds is gentle on the engine and quick for the person
    const left = () => Math.max(1, deadline - now());
    const started = await call(`/api/v1/studios/${encodeURIComponent(studio)}/runs`, { method: "POST", body: JSON.stringify({ inputs }) }, left(), signal);
    if (!started.ok) return refusal(started);
    const first = await readRun(started);
    let current = first;
    while (current.status === RunStatus.Running || current.status === RunStatus.Pending || current.status === RunStatus.Waiting) {
      if (now() >= deadline) return failure(AiFailure.Unreachable, `Orazaka's ${studio} run did not finish in time`);
      await new Promise((resolve) => setTimeout(resolve, pollEvery));
      const polled = await call(`/api/v1/studios/runs/${encodeURIComponent(first.id)}`, { method: "GET" }, left(), signal);
      if (!polled.ok) return refusal(polled);
      current = await readRun(polled);
    }
    if (current.status !== RunStatus.Succeeded) return failure(AiFailure.Unreachable, `Orazaka's ${studio} run ended ${current.status}`);
    try {
      return { runId: first.id, report: JSON.parse(String(current.outputs.find((o) => o.key === "report")?.value)) };
    } catch {
      return failure(AiFailure.BadResponse, `Orazaka's ${studio} run answered something that is not the contract`);
    }
  }

  /**
   * The photo check: the thumbnails are uploaded as assets (the vision step reads them by id) and also travel as bytes (the face
   * worker reads those), the `profile-photo-check` Studio is run, and the run is asked about until it ends. The engine's own words
   * (a model's error, a stack) stay in its logs: the product only learns that the check was out of reach.
   */
  async function runPhotoCheck({ photos, counts, compareFaces, signal }: PhotoCheckInput, assetIds: string[]): Promise<PhotoCheckResult> {
    const start = now();
    const deadline = start + (options.photoCheckTimeoutMs ?? 180_000); // @fixed: three minutes for a vision model reading up to six photos on a small machine
    const left = () => Math.max(1, deadline - now());
    for (const photo of photos) {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "photo.jpg");
      const uploaded = await call("/api/v1/media/upload", { method: "POST", body: form }, left(), signal);
      if (!uploaded.ok) return refusal(uploaded);
      const id = await uploaded.json().then((j: { assetId?: unknown }) => j.assetId, () => undefined);
      if (typeof id !== "string" || !id) return failure(AiFailure.BadResponse, "Orazaka answered an upload without an asset id");
      assetIds.push(id);
    }
    const run = await runStudio("profile-photo-check", { photos: assetIds, photosBase64: photos.map((p) => p.toString("base64")), compareFaces, ...counts }, deadline, signal);
    const parsed = PhotoCheckReport.safeParse(run.report);
    if (!parsed.success) return failure(AiFailure.BadResponse, "Orazaka's photo check answered something that is not the contract");
    return { runId: run.runId, report: parsed.data, ms: now() - start };
  }

  return {
    async judgeMessage({ text, locale, signal }: MessageJudgeInput): Promise<MessageJudgeResult> {
      if (!text.trim()) throw new Error("judgeMessage takes a non-blank text");
      const start = now();
      const run = await runStudio("message-authenticity", { text, locale }, start + (options.messageJudgeTimeoutMs ?? 30_000), signal); // @fixed: a classifier answers in seconds; the signal never waits longer
      const parsed = MessageJudgeReport.safeParse(run.report);
      if (!parsed.success) return failure(AiFailure.BadResponse, "Orazaka's message check answered something that is not the contract");
      return { runId: run.runId, report: parsed.data, ms: now() - start };
    },

    async checkPhotos(input: PhotoCheckInput): Promise<PhotoCheckResult> {
      if (input.photos.length < 1 || input.photos.length > MAX_CHECK_PHOTOS) throw new Error(`checkPhotos takes 1 to ${MAX_CHECK_PHOTOS} photos`);
      const assetIds: string[] = [];
      try {
        return await runPhotoCheck(input, assetIds);
      } finally {
        // The person's photos are read once; they are taken back the moment the answer is in, whatever it is (best effort).
        await Promise.allSettled(assetIds.map((id) => call(`/api/v1/media/assets/${encodeURIComponent(id)}`, { method: "DELETE" }, options.embedTimeoutMs)));
      }
    },

    async chat({ conversationId, prompt, signal }: ChatInput): Promise<ChatResult> {
      const start = now();
      const response = await call(`/api/v1/chat/stream/${encodeURIComponent(conversationId)}`, { method: "POST", body: JSON.stringify({ prompt }) }, options.chatTimeoutMs, signal);
      if (!response.ok) return refusal(response);
      let body: string;
      try {
        body = await response.text();
      } catch {
        return failure(AiFailure.Unreachable, "Orazaka's stream was cut");
      }
      let text = "";
      for (const payload of sseData(body, "message")) {
        try {
          const content = (JSON.parse(payload) as { content?: unknown }).content;
          if (typeof content === "string") text += content;
        } catch {
          return failure(AiFailure.BadResponse, "Orazaka sent an event that is not JSON");
        }
      }
      // The engine forgets the turn: a person's words are not kept in its memory (best effort, never awaited by the caller's result).
      void call(`/api/v1/chat/sessions/${encodeURIComponent(conversationId)}`, { method: "DELETE" }, options.embedTimeoutMs).catch(() => undefined);
      if (!text.trim()) return failure(AiFailure.BadResponse, "Orazaka answered nothing");
      return { text: text.trim(), conversationId, ms: now() - start };
    },

    async embed(texts: readonly string[], signal?: AbortSignal): Promise<EmbedResult> {
      if (texts.length === 0 || texts.length > MAX_EMBED_BATCH || texts.some((t) => !t.trim())) throw new Error(`embed takes 1 to ${MAX_EMBED_BATCH} non-blank texts`);
      const start = now();
      const response = await call("/api/v1/embeddings", { method: "POST", body: JSON.stringify({ input: texts }) }, options.embedTimeoutMs, signal);
      if (!response.ok) return refusal(response);
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return failure(AiFailure.BadResponse, "Orazaka answered something that is not JSON");
      }
      const parsed = parseEmbeddings(body, texts.length);
      if (!parsed) return failure(AiFailure.BadResponse, "Orazaka answered an unexpected shape");
      return { ...parsed, ms: now() - start };
    },
  };
}

const MAX_CHECK_PHOTOS = 12;

interface RunView {
  id: string;
  status: string;
  outputs: { key?: string; value?: unknown }[];
}

async function readRun(response: Response): Promise<RunView> {
  let body: { id?: unknown; status?: unknown; outputs?: unknown };
  try {
    body = await response.json();
  } catch {
    return failure(AiFailure.BadResponse, "Orazaka answered a run that is not JSON");
  }
  if (typeof body.id !== "string" || typeof body.status !== "string") return failure(AiFailure.BadResponse, "Orazaka answered an unexpected run");
  return { id: body.id, status: body.status, outputs: Array.isArray(body.outputs) ? (body.outputs as RunView["outputs"]) : [] };
}

function parseEmbeddings(body: unknown, expected: number): Omit<EmbedResult, "ms"> | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as { runId?: unknown; model?: unknown; data?: unknown; usage?: { promptTokens?: unknown } };
  if (typeof b.runId !== "string" || !b.runId || typeof b.model !== "string" || !Array.isArray(b.data) || b.data.length !== expected) return null;
  const ordered = [...(b.data as { index?: unknown; embedding?: unknown }[])].sort((x, y) => Number(x.index) - Number(y.index));
  const vectors: number[][] = [];
  for (const item of ordered) {
    if (!Array.isArray(item.embedding) || item.embedding.length === 0 || !item.embedding.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    vectors.push(item.embedding as number[]);
  }
  const dimensions = vectors[0].length;
  if (vectors.some((v) => v.length !== dimensions)) return null;
  return { runId: b.runId, model: b.model, dimensions, vectors, promptTokens: typeof b.usage?.promptTokens === "number" ? b.usage.promptTokens : 0 };
}
