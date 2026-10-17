import type { ClipId } from "./media";

/**
 * The cues of the captions, per recording: the id of a message (`demo.<clip>.cues.<id>`) and the second it appears at,
 * in the clip's own seconds (`npm run dev:journey` then `scripts/journey-clips.mjs` write them to `clips.json`). The words
 * are messages in both languages; the recordings are the real journey, never scripted on the agent's side.
 */
export const CUES = {
  talk: [
    { id: "open", at: 0 },
    { id: "first", at: 4.3 },
    { id: "range", at: 18.2 },
    { id: "saturday", at: 26.8 },
    { id: "enough", at: 39.4 },
    { id: "portrait", at: 51.9 },
  ],
  batch: [
    { id: "open", at: 0 },
    { id: "looking", at: 1.1 },
    { id: "shown", at: 12.9 },
  ],
} as const satisfies Record<ClipId, readonly { id: string; at: number }[]>;
