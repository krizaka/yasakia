import { purgeDeletedMedia } from "./account";
import { drainAnalytics } from "./analytics";
import { sweepBatches } from "./batches";
import { analyticsConnection, photoCheckConfig, setting } from "./env";
import { sweepExports } from "./export";
import { sweepIntros } from "./intros";
import { finalizeStaleSignals } from "./message-signals";
import { sweepPhotoChecks } from "./photo-check";
import { processQueue } from "./photo-check-runner";
import { sweepAbandonedUploads } from "./photos";
import { sweepRateLimits } from "./rate-limit";
import { sweepAuthCodes } from "./sign-in";
import { sweepWebSessions } from "./web-session";

/**
 * The background loops every instance runs (started by instrumentation.ts, never during the build): the photo checks asked and not yet worked, the purge of
 * deleted accounts' media (`FOR UPDATE SKIP LOCKED`, so instances share it), and the sweeps of what expired —
 * sign-in codes, abandoned uploads, exports, rate-limit windows, batches past their hours (→ debrief), intros past their days (→ faded). Each tick is independent; a failure is logged and the
 * next tick tries again. One timer per process (globalThis), whatever Next loads twice.
 */

const holder = globalThis as unknown as { __yasakiaJobs?: NodeJS.Timeout[] };

async function tick(name: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    // The database's own words are in the cause (drizzle wraps them in "Failed query: …"): without them a failing loop says nothing.
    const cause = (error as { cause?: { message?: string; code?: string } }).cause;
    console.error(`[jobs] ${name} failed:`, cause?.message ? `${cause.code ?? ""} ${cause.message}`.trim() : (error as Error).message);
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
        await sweepPhotoChecks();
        await finalizeStaleSignals();
      }),
    sweepEvery,
  );
  // Orazaka's analytics (krizaka/yasakia#86): the outbox drains every APP_ANALYTICS_INTERVAL_SECONDS when connected.
  const analyticsEvery = setting("APP_ANALYTICS_INTERVAL_SECONDS", 30, 5, 3600) * 1000;
  const analytics = setInterval(
    () =>
      void tick("analytics", async () => {
        const conn = analyticsConnection();
        if (conn) await drainAnalytics(conn);
      }),
    analyticsEvery,
  );
  // The photo checks asked and not yet worked (a request works its own at once; this takes what an instance left queued).
  const photoChecks = setInterval(() => void tick("photo-checks", async () => void (await processQueue(photoCheckConfig))), setting("APP_PHOTO_CHECK_INTERVAL_SECONDS", 15, 5, 600) * 1000);
  purge.unref();
  sweep.unref();
  analytics.unref();
  photoChecks.unref();
  holder.__yasakiaJobs = [purge, sweep, analytics, photoChecks];
}

/** Purges right away (after a deletion's response) instead of waiting for the next tick. */
export function purgeSoon(): void {
  void tick("purge", () => purgeDeletedMedia());
}
