/**
 * The home's structure and its figures — never its words (those are `landing.*` messages in both languages).
 *
 * The figures are the product's rules, the ones its code enforces: a profile holds 4 to 6 photos with at least 2 showing
 * the person's face (rule set `PHOTOS`), a batch is 3 to 5 people (fewer: the person waits, nobody is invented), an
 * introduction stays open seven days. The band under the hero counts them with `NumberTicker`; no message types a number.
 */
export const FIGURES = { batchMin: 3, batchMax: 5, photosMin: 4, photosMax: 6, facePhotos: 2, introDays: 7 } as const;

/** The home's sections, in reading order (a test holds the page to it). */
export const HOME_SECTIONS = ["hero", "features", "people", "journey", "not-doing", "comparison", "promise", "faq", "closing"] as const;

/** Camille's journey, one step per beat of the real recorded run (a clip each, lib/media.ts TAKES) (`landing.journey.steps.<id>`). */
export const JOURNEY_STEPS = ["photos", "talk", "batch", "write", "media"] as const;

/** What Yasakia refuses, each as a decision (`landing.notDoing.items.<id>`). */
export const NOT_DOING = ["ghostwriting", "swipe", "score"] as const;

/** The comparison's rows (`landing.comparison.rows.<id>`). */
export const COMPARISON_ROWS = ["start", "show", "photos", "writes", "signal"] as const;

export const FAQ_IDS = ["open", "photos", "faces", "writes", "signal", "engine"] as const;
