import { createBus, eventStream, type RealtimeBus } from "@krizaka/realtime";
import { pgChannel } from "@krizaka/realtime/pg";
import { redisBus } from "@krizaka/realtime/redis";
import { CONNECTION_NAMES, connectionConfig, directDatabaseUrl, getPool } from "@yazakia/db";

import { type RealtimeConfig, realtimeConfig } from "./env";

/**
 * The realtime door: everything pushed live goes through here, and it knows **typed events only** — a batch is ready,
 * an intro opened, a message arrived in an intro. The transport is `@krizaka/realtime`'s `RealtimeBus`: PostgreSQL
 * LISTEN/NOTIFY by default (no broker), Redis / Valkey with `REALTIME_BUS=redis`; business code never knows which.
 *
 * Payloads are small facts (ids), never documents: what must not be lost is in the database and fetched from it.
 * LISTEN needs a session: it goes through DATABASE_DIRECT_URL (else DATABASE_URL) on its own connection named
 * `yazakia-listen`; NOTIFY goes through the app's pool.
 */

export type YazakiaEvent =
  | { type: "batch.ready"; batchId: string }
  | { type: "intro.opened"; introId: string }
  | { type: "intro.message"; introId: string; messageId: string };

export const EVENT_TYPES = ["batch.ready", "intro.opened", "intro.message"] as const satisfies readonly YazakiaEvent["type"][];

/** The NOTIFY channel and the Redis prefix of Yazakia — keep them: two versions share them during a deploy. */
export const CHANNEL = "yazakia_events";

/** One account's topic: its events, wherever they come from. */
export const accountTopic = (accountId: string) => `account:${accountId}`;

/** Whether a received payload is one of Yazakia's events (anything else on the bus is ignored). */
export function isYazakiaEvent(value: unknown): value is YazakiaEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  switch (event.type) {
    case "batch.ready":
      return typeof event.batchId === "string";
    case "intro.opened":
      return typeof event.introId === "string";
    case "intro.message":
      return typeof event.introId === "string" && typeof event.messageId === "string";
    default:
      return false;
  }
}

/** A bus for a configuration — the app's one (below), or two in the integration test standing for two instances. */
export function createYazakiaBus(config: RealtimeConfig): RealtimeBus {
  return createBus({
    kind: config.kind,
    postgres:
      config.kind === "postgres"
        ? pgChannel({ listen: { ...connectionConfig(directDatabaseUrl(), CONNECTION_NAMES.listen) } as Record<string, unknown>, notify: getPool() })
        : undefined,
    channel: CHANNEL,
    redisBus,
    redisUrl: config.redisUrl,
    prefix: config.prefix,
  });
}

// One bus per process, kept across hot reloads and Next's module graphs.
const holder = globalThis as unknown as { __yazakiaBus?: RealtimeBus };

export function realtimeBus(): RealtimeBus {
  if (!holder.__yazakiaBus) holder.__yazakiaBus = createYazakiaBus(realtimeConfig());
  return holder.__yazakiaBus;
}

/** Tests: use this bus (null: back to the configured one). */
export function useRealtimeBus(bus: RealtimeBus | null): void {
  holder.__yazakiaBus = bus ?? undefined;
}

/** Sends an event to one account, on every instance. Never throws: realtime is best-effort. */
export async function publishToAccount(accountId: string, event: YazakiaEvent): Promise<void> {
  try {
    await realtimeBus().publish(accountTopic(accountId), event);
  } catch (error) {
    console.warn(`[realtime] publish ${event.type} failed`, (error as Error).message);
  }
}

/** Subscribes to an account's events on this instance; returns the unsubscribe function. */
export function subscribeToAccount(accountId: string, onEvent: (event: YazakiaEvent) => void): () => void {
  return realtimeBus().subscribe(accountTopic(accountId), (event) => {
    if (isYazakiaEvent(event)) onEvent(event);
  });
}

/**
 * The account's Server-Sent Events stream (`GET /api/events`): a `connected` event, then each event named by its type
 * (`event: batch.ready`), a heartbeat every 15 s, an end after REALTIME_STREAM_MAX_SECONDS (the app reconnects at once).
 */
export function accountEventStream(accountId: string): Response {
  const { streamMaxSeconds } = realtimeConfig();
  return eventStream({
    retryMs: 2000,
    heartbeatMs: 15_000,
    maxLifetimeMs: streamMaxSeconds * 1000,
    start: ({ send }) => {
      send({ event: "connected", data: { status: "connected" } });
      return subscribeToAccount(accountId, (event) => send({ event: event.type, data: event }));
    },
  });
}

/** Whether events from other instances reach this one (the health check reports it). */
export function realtimeConnected(): boolean {
  return holder.__yazakiaBus?.connected ?? false;
}
