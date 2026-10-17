import type { ClipId } from "./media";

/**
 * The cues of the captions, per recording: the id of a message (`demo.<clip>.cues.<id>`) and the second it appears at,
 * in the clip's own seconds (`npm run dev:journey` then `scripts/journey-clips.mjs` write them to `clips.json`). The words
 * are messages in both languages; the recordings are the real journey, never scripted on the agent's side.
 */
export const CUES = {
  loop: [
    { id: "talk", at: 0.3 },
    { id: "first", at: 2.7 },
    { id: "understood", at: 13.3 },
    { id: "portrait", at: 32 },
    { id: "look", at: 33.8 },
    { id: "shown", at: 42.1 },
    { id: "answer", at: 43.1 },
    { id: "yes", at: 45.8 },
    { id: "answered", at: 50.3 },
    { id: "debrief", at: 52.1 },
    { id: "intro", at: 53.8 },
    { id: "line", at: 57.8 },
  ],
} as const satisfies Record<ClipId, readonly { id: string; at: number }[]>;
