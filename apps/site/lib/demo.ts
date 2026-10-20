import type { Locale } from "./i18n";
import type { TakeId } from "./media";

/**
 * The cues of the captions of the full take, in the take's own seconds (the `at` of each step of `scripts/record-take.mjs`'
 * evidence.json — the French and the English runs have their own timing). The words are messages in both languages
 * (`demo.journey.cues.<id>`); the recording is the real run, never scripted on the agent's side.
 */
export const CUES = {
  fr: [
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
  en: [
    { id: "photos", at: 3.6 },
    { id: "checked", at: 73.7 },
    { id: "talk", at: 76.6 },
    { id: "portrait", at: 115 },
    { id: "batch", at: 117.6 },
    { id: "yes", at: 138.8 },
    { id: "intro", at: 147.5 },
    { id: "signal", at: 157 },
    { id: "photo", at: 167.7 },
    { id: "voice", at: 175.8 },
  ],
} as const satisfies Record<Locale, readonly { id: string; at: number }[]>;

export type { TakeId };
