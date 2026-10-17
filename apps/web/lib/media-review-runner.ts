import type { AiProvider } from "@yasakia/ai";

import { hasPendingMedia, reviewNextMedia } from "./intro-media";

/**
 * The loop that decides the media waiting for their safety check: one per process, one at a time (the engine reads one at a time). The
 * engine arrives as `config`, read at the edge (`mediaReviewConfig` of `lib/env.ts`), and only when a media is waiting. A check that
 * cannot decide leaves the media held — never approved — and is tried again later.
 */

const holder = globalThis as unknown as { __yasakiaMediaReviewBusy?: boolean };

export function reviewSoon(config: () => { ai: AiProvider }): void {
  if (holder.__yasakiaMediaReviewBusy) return;
  holder.__yasakiaMediaReviewBusy = true;
  void (async () => {
    try {
      await reviewQueue(config);
    } catch (error) {
      console.error("[media] the review loop failed:", (error as Error).message);
    } finally {
      holder.__yasakiaMediaReviewBusy = false;
    }
  })();
}

/** Every media waiting and due, in turn; true when there was at least one. */
export async function reviewQueue(config: () => { ai: AiProvider }): Promise<boolean> {
  if (!(await hasPendingMedia())) return false;
  let any = false;
  const { ai } = config();
  while (await reviewNextMedia(ai)) any = true;
  return any;
}
