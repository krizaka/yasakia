import { AiUnavailableError } from "@yasakia/ai";
import { EncryptionKeyError, isDatabaseUnavailable } from "@yasakia/db";
import { NextResponse } from "next/server";
import { type z, ZodError } from "zod";

import { ConfigurationError } from "./env";

/**
 * An error that carries the HTTP status it should be answered with — and, for refusals a client acts on, a stable
 * `code` (the app words it, never parses the English message) and headers such as `Retry-After`.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** A refusal with a stable code. */
export const refuse = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => new HttpError(status, message, { code, ...extra });

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status, headers });
}

/**
 * Turns any thrown value into a response without leaking internals: an HttpError keeps its status and message, a
 * validation error answers 400, a configuration problem 503 (fail-closed), the database unavailable 503, anything else 500.
 */
export function errorResponse(error: unknown, context: string) {
  if (error instanceof HttpError) return jsonError(error.status, error.message, error.extra, error.headers);
  if (error instanceof ZodError) return jsonError(400, "Invalid payload", { code: "INVALID_PAYLOAD", details: error.flatten() });
  if (error instanceof SyntaxError) return jsonError(400, "Malformed JSON body", { code: "INVALID_PAYLOAD" });
  if (error instanceof ConfigurationError || error instanceof EncryptionKeyError) {
    console.error(`[${context}] configuration error: ${error.message}`);
    // Developers see what to configure; production never tells clients about its configuration.
    return jsonError(503, process.env.NODE_ENV === "production" ? "Service temporarily unavailable" : error.message, { code: "UNAVAILABLE" });
  }
  if (error instanceof AiUnavailableError) {
    // The engine's state is ours to log; the client only learns that the agent is out of reach, and can retry.
    console.error(`[${context}] ai unavailable: ${error.code}`);
    return jsonError(503, "The agent is out of reach, try again in a moment", { code: "AI_UNAVAILABLE" }, { "Retry-After": "10" });
  }
  if (isDatabaseUnavailable(error)) return jsonError(503, "Service temporarily unavailable", { code: "UNAVAILABLE" }, { "Retry-After": "5" });
  console.error(`[${context}]`, error);
  return jsonError(500, "Internal server error", { code: "INTERNAL" });
}

/** Runs a handler body and answers its errors through {@link errorResponse}. */
export async function handle(context: string, body: () => Promise<Response>): Promise<Response> {
  try {
    return await body();
  } catch (error) {
    return errorResponse(error, context);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A path id: anything that is not a UUID is a 404, never a 500. */
export function uuidParam(value: string | undefined): string {
  if (!value || !UUID.test(value)) throw new HttpError(404, "Not found", { code: "NOT_FOUND" });
  return value.toLowerCase();
}

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** The JSON body validated by a schema (400 when it is malformed or does not fit). */
export async function readJson<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  const text = await req.text();
  return schema.parse(text ? JSON.parse(text) : {});
}

export const ok = (body: Record<string, unknown> = {}, init?: ResponseInit) => NextResponse.json({ success: true, ...body }, init);

/** True for a PostgreSQL unique-constraint violation (drizzle wraps the driver error in `cause`). */
export function isUniqueViolation(error: unknown): boolean {
  for (let e = error, depth = 0; typeof e === "object" && e !== null && depth < 3; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: string }).code === "23505") return true;
  }
  return false;
}
