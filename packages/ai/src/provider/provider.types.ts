/**
 * The port through which Yasakia reaches AI. Two operations, nothing provider-specific: a conversational turn and
 * embeddings. The one adapter is Orazaka's (`orazaka.ts`); Yasakia never calls a model provider.
 */

import type { MessageJudgeInput, MessageJudgeResult } from "./message-judge.types";
import type { PhotoCheckInput, PhotoCheckResult } from "./photo-check.types";

export const AiFailure = {
  /** No engine URL or key configured. */
  NotConfigured: "not_configured",
  /** The engine did not answer (network, timeout, 5xx). */
  Unreachable: "unreachable",
  /** The engine refused (401/403/4xx): the key, its scope or the payload is ours to fix. */
  Refused: "refused",
  /** The engine answered something that is not the contract. */
  BadResponse: "bad_response",
} as const;
export type AiFailure = (typeof AiFailure)[keyof typeof AiFailure];

/** Every failure of the port: a typed code, never a provider message (the product answers 503 and says nothing of the engine). */
export class AiUnavailableError extends Error {
  constructor(
    readonly code: AiFailure,
    message: string,
  ) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export interface ChatInput {
  /** One id per turn: the engine files the turn under it, and it is the proof of the run in the engine's logs. */
  conversationId: string;
  prompt: string;
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  conversationId: string;
  ms: number;
}

export interface EmbedResult {
  /** The engine's id of the run (`embedding.run runId=…`), the proof of use. */
  runId: string;
  model: string;
  dimensions: number;
  vectors: number[][];
  promptTokens: number;
  ms: number;
}

export interface AiProvider {
  /** One reply, collected from the engine's stream. */
  chat(input: ChatInput): Promise<ChatResult>;
  /** Vectors for 1 to {@link MAX_EMBED_BATCH} non-blank texts, in order. */
  embed(texts: readonly string[], signal?: AbortSignal): Promise<EmbedResult>;
  /**
   * Checks a set of profile photos with Orazaka's `profile-photo-check` Studio (faces, the same person throughout, no
   * text or contact over the picture, no screenshot) and returns its verdict as codes.
   */
  checkPhotos(input: PhotoCheckInput): Promise<PhotoCheckResult>;
  /**
   * Reads a message's text with Orazaka's `message-authenticity` Studio and returns a coarse level — the engine JUDGES a message, it
   * never writes one.
   */
  judgeMessage(input: MessageJudgeInput): Promise<MessageJudgeResult>;
}

// @fixed: Orazaka's limit per request (EmbeddingClientImpl.MAX_BATCH).
export const MAX_EMBED_BATCH = 128;
