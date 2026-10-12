/** The limits of profile photos — the only place they are written (the API and the mobile app read them from here). */

/** At most this many photos per profile. */
export const MAX_PHOTOS = 6;

/** The largest original a phone may send (the stored, re-encoded file is much smaller). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** What a phone may send; everything is re-encoded to JPEG on completion. */
export const PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type PhotoType = keyof typeof PHOTO_TYPES;

/** The stored photo is at most this wide or tall. */
export const STORED_MAX_EDGE = 2048;

/** The widths a signed photo URL may ask for (`?w=`): a closed list, so the CDN caches a handful of variants. */
export const PHOTO_WIDTHS = [160, 320, 480, 640, 960, 1280] as const;
export const DEFAULT_PHOTO_WIDTH = 640;

/** The nearest allowed width at or above the one asked (the largest when beyond). */
export function photoWidth(asked: number | null | undefined): number {
  if (!asked || !Number.isFinite(asked) || asked <= 0) return DEFAULT_PHOTO_WIDTH;
  return PHOTO_WIDTHS.find((w) => w >= asked) ?? PHOTO_WIDTHS[PHOTO_WIDTHS.length - 1];
}

/** Signed URLs — photo views and uploads — live 300 seconds. */
export const SIGNED_URL_TTL_SECONDS = 300;
