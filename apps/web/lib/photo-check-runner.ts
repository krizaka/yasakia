import type { AiProvider } from "@yasakia/ai";

import { hasQueuedPhotoCheck, processNextPhotoCheck } from "./photo-check";

/**
 * The loop that works the photo checks: one per process, one check at a time — the engine reads one set at a time. What it
 * needs from the deployment (the engine, the comparison flag) arrives as `config`, read at the edge (`photoCheckConfig` of
 * `lib/env.ts`), and only when a check is waiting.
 */

export interface PhotoCheckConfig {
  ai: AiProvider;
  compareFaces: boolean;
}

const holder = globalThis as unknown as { __yasakiaPhotoCheckBusy?: boolean };

/** Works the queued checks now (a request does not wait for it). Never throws. */
export function processSoon(config: () => PhotoCheckConfig): void {
  if (holder.__yasakiaPhotoCheckBusy) return;
  holder.__yasakiaPhotoCheckBusy = true;
  void (async () => {
    try {
      await processQueue(config);
    } catch (error) {
      console.error("[photos] the check loop failed:", (error as Error).message);
    } finally {
      holder.__yasakiaPhotoCheckBusy = false;
    }
  })();
}

/** Every queued check, in turn; true when there was at least one. */
export async function processQueue(config: () => PhotoCheckConfig): Promise<boolean> {
  if (!(await hasQueuedPhotoCheck())) return false;
  let any = false;
  const { ai, compareFaces } = config();
  while (await processNextPhotoCheck(ai, { compareFaces })) any = true;
  return any;
}
