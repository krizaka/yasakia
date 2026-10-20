import type { TakeId } from "./media";

/**
 * The cues of the captions of the full take, in the take's own seconds (the steps of `scripts/record-take.mjs`' evidence.json:
 * `at` of each step). The words are messages in both languages (`demo.journey.cues.<id>`); the recording is the real run,
 * never scripted on the agent's side.
 */
export const CUES = {
  full: [
    { id: "photos", at: 3.7 },
    { id: "checked", at: 45 },
    { id: "talk", at: 47.8 },
    { id: "portrait", at: 99 },
    { id: "batch", at: 101.5 },
    { id: "yes", at: 125 },
    { id: "intro", at: 134.3 },
    { id: "signal", at: 146 },
    { id: "photo", at: 156.9 },
    { id: "voice", at: 165 },
  ],
} as const satisfies Partial<Record<TakeId, readonly { id: string; at: number }[]>>;
