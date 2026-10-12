import crypto from "node:crypto";

import { bunnyStorage, localStorage, type MediaStorage, photoWidth, signBunnyUrl, signLocalMediaUrl, signUpload } from "@yazakia/media";

import { appUrl, type MediaConfig, mediaConfig, sessionSecret } from "./env";

/**
 * The media door: the storage of this deployment and the two signatures — a 300-second photo URL for one viewer, a
 * 300-second upload URL for one photo. With Bunny, the photo URL is the pull zone's (token authentication, the
 * Optimizer resizes to the signed `width`); with the local storage (development), it is the API's own
 * `/api/media/…` route, signed the same way. A storage key never leaves the server unsigned.
 */

const holder = globalThis as unknown as { __yazakiaStorage?: { key: string; storage: MediaStorage } };

export function mediaStorage(config: MediaConfig = mediaConfig()): MediaStorage {
  const key = JSON.stringify(config);
  if (holder.__yazakiaStorage?.key !== key) {
    holder.__yazakiaStorage = { key, storage: config.driver === "bunny" ? bunnyStorage(config) : localStorage(config.dir) };
  }
  return holder.__yazakiaStorage.storage;
}

/** The HMAC key of the API's own signatures (uploads, local media), derived from SESSION_SECRET for this purpose only. */
export function mediaSecret(): string {
  return crypto.createHash("sha256").update(`yazakia-media:${sessionSecret()}`).digest("hex");
}

export interface SignedPhoto {
  url: string;
  width: number;
  expiresAt: string;
}

/** A photo URL for one viewer: the asked width snapped to the allowed ones, valid 300 seconds. */
export function signPhotoUrl(storageKey: string, askedWidth?: number | null, config: MediaConfig = mediaConfig()): SignedPhoto {
  const width = photoWidth(askedWidth);
  const signed =
    config.driver === "bunny"
      ? signBunnyUrl({ hostname: config.pullZoneHostname, path: `/${storageKey}`, tokenKey: config.tokenKey, params: { width } })
      : signLocalMediaUrl({ baseUrl: appUrl(), key: storageKey, width, secret: mediaSecret() });
  return { url: signed.url, width, expiresAt: new Date(signed.expires * 1000).toISOString() };
}

/** The URL a phone PUTs one photo's bytes to — this API's upload route, signed for that photo, 300 seconds. */
export function signPhotoUpload(photoId: string): { url: string; expiresAt: Date } {
  const { signature, expires } = signUpload({ photoId, secret: mediaSecret() });
  return { url: `${appUrl()}/api/uploads/photos/${photoId}?expires=${expires}&signature=${signature}`, expiresAt: new Date(expires * 1000) };
}
