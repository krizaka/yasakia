import type { Locale } from "./i18n";
import type { TakeId } from "./media";

/**
 * The cues of the captions of the full take, in the take's own seconds (the `at` of each step of `scripts/record-take.mjs`'
 * evidence.json — the French and the English runs have their own timing). The words are messages in both languages
 * (`demo.journey.cues.<id>`); the recording is the real run, never scripted on the agent's side.
 */
export const CUES = {
  fr: [
    { id: "photos", at: 4.1 },
    { id: "checked", at: 52.2 },
    { id: "talk", at: 55.0 },
    { id: "portrait", at: 94.9 },
    { id: "batch", at: 97.4 },
    { id: "yes", at: 149.3 },
    { id: "intro", at: 158.3 },
    { id: "signal", at: 186.3 },
    { id: "photo", at: 189.3 },
    { id: "voice", at: 203.8 },
  ],
  en: [
    { id: "photos", at: 3.7 },
    { id: "checked", at: 90.3 },
    { id: "talk", at: 93.2 },
    { id: "portrait", at: 190.1 },
    { id: "batch", at: 192.6 },
    { id: "yes", at: 207.6 },
    { id: "intro", at: 216.4 },
    { id: "signal", at: 233.8 },
    { id: "photo", at: 236.8 },
    { id: "voice", at: 244.9 },
  ],
} as const satisfies Record<Locale, readonly { id: string; at: number }[]>;

export type { TakeId };
