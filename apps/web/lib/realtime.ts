import { createBus, eventStream, type RealtimeBus } from "@krizaka/realtime";
import { pgChannel } from "@krizaka/realtime/pg";
import { redisBus } from "@krizaka/realtime/redis";
import { CONNECTION_NAMES, connectionConfig, directDatabaseUrl, getPool } from "@yasakia/db";

import { type RealtimeConfig, realtimeConfig } from "./env";

/**
 * The realtime door: everything pushed live goes through here, and it knows **typed events only** — a batch is ready,
 * an intro opened, a message arrived in an intro. The transport is `@krizaka/realtime`'s `RealtimeBus`: PostgreSQL
 * LISTEN/NOTIFY by default (no broker), Redis / Valkey with `REALTIME_BUS=redis`; business code never knows which.
 *
 * Payloads are small facts (ids), never documents: what must not be lost is in the database and fetched from it.
 * LISTEN needs a session: it goes through DATABASE_DIRECT_URL (else DATABASE_URL) on its own connection named
 * `yasakia-listen`; NOTIFY goes through the app's pool.
 */

export type YasakiaEvent =
  | { type: "batch.ready"; batchId: string }
  | { type: "intro.opened"; introId: string }
  | { type: "intro.message"; introId: string; messageId: string };

export const EVENT_TYPES = ["batch.ready", "intro.opened", "intro.message"] as const satisfies readonly YasakiaEvent["type"][];

/** The NOTIFY channel and the Redis prefix of Yasakia — keep them: two versions share them during a deploy. */
export const CHANNEL = "yasakia_events";

/** One account's topic: its events, wherever they come from. */
export const accountTopic = (accountId: string) => `account:${accountId}`;

/** Whether a received payload is one of Yasakia's events (anything else on the bus is ignored). */
export function isYasakiaEvent(value: unknown): value is YasakiaEvent {
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
export function createYasakiaBus(config: RealtimeConfig): RealtimeBus {
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
const holder = globalThis as unknown as { __yasakiaBus?: RealtimeBus };

export function realtimeBus(): RealtimeBus {
  if (!holder.__yasakiaBus) holder.__yasakiaBus = createYasakiaBus(realtimeConfig());
  return holder.__yasakiaBus;
}

/** Tests: use this bus (null: back to the configured one). */
export function useRealtimeBus(bus: RealtimeBus | null): void {
  holder.__yasakiaBus = bus ?? undefined;
}

/** Sends an event to one account, on every instance. Never throws: realtime is best-effort. */
export async function publishToAccount(accountId: string, event: YasakiaEvent): Promise<void> {
  try {
    await realtimeBus().publish(accountTopic(accountId), event);
  } catch (error) {
    console.warn(`[realtime] publish ${event.type} failed`, (error as Error).message);
  }
}

/** Subscribes to an account's events on this instance; returns the unsubscribe function. */
export function subscribeToAccount(accountId: string, onEvent: (event: YasakiaEvent) => void): () => void {
  return realtimeBus().subscribe(accountTopic(accountId), (event) => {
    if (isYasakiaEvent(event)) onEvent(event);
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
  return holder.__yasakiaBus?.connected ?? false;
}
