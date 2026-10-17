import { purgeDeletedMedia } from "./account";
import { sweepBatches } from "./batches";
import { setting } from "./env";
import { sweepExports } from "./export";
import { sweepIntros } from "./intros";
import { sweepAbandonedUploads } from "./photos";
import { sweepRateLimits } from "./rate-limit";
import { sweepAuthCodes } from "./sign-in";
import { sweepWebSessions } from "./web-session";

/**
 * The background loops every instance runs (started by instrumentation.ts, never during the build): the purge of
 * deleted accounts' media (`FOR UPDATE SKIP LOCKED`, so instances share it), and the sweeps of what expired —
 * sign-in codes, abandoned uploads, exports, rate-limit windows, batches past their hours (→ debrief), intros past their days (→ faded). Each tick is independent; a failure is logged and the
 * next tick tries again. One timer per process (globalThis), whatever Next loads twice.
 */

const holder = globalThis as unknown as { __yasakiaJobs?: NodeJS.Timeout[] };

async function tick(name: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`[jobs] ${name} failed:`, (error as Error).message);
  }
}

export function startJobs(): void {
  if (holder.__yasakiaJobs) return;
  const purgeEvery = setting("APP_ACCOUNT_PURGE_INTERVAL_SECONDS", 60, 1, 3600) * 1000;
  const sweepEvery = setting("APP_SWEEP_INTERVAL_SECONDS", 600, 5, 86_400) * 1000;
  const purge = setInterval(() => void tick("purge", () => purgeDeletedMedia()), purgeEvery);
  const sweep = setInterval(
    () =>
      void tick("sweep", async () => {
        await sweepAuthCodes();
        await sweepAbandonedUploads();
        await sweepExports();
        await sweepRateLimits();
        await sweepWebSessions();
        await sweepBatches();
        await sweepIntros();
      }),
    sweepEvery,
  );
  purge.unref();
  sweep.unref();
  holder.__yasakiaJobs = [purge, sweep];
}

/** Purges right away (after a deletion's response) instead of waiting for the next tick. */
export function purgeSoon(): void {
  void tick("purge", () => purgeDeletedMedia());
}
