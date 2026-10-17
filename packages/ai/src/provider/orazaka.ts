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
      return await doFetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, signal: signal ? AbortSignal.any([timeout, signal]) : timeout, cache: "no-store" });
    } catch {
      // A network error can name the host, never the key; the type is all a caller needs.
      return failure(AiFailure.Unreachable, "Orazaka did not answer");
    }
  };
  const refusal = (response: Response) => failure(response.status >= 500 ? AiFailure.Unreachable : AiFailure.Refused, `Orazaka answered ${response.status}`);

  return {
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
