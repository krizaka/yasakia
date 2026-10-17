import crypto from "node:crypto";

import { bunnyStorage, localStorage, type MediaStorage, photoWidth, setFfmpegBinary, signBunnyUrl, signLocalMediaUrl, signUpload, verifyUpload } from "@yasakia/media";

import { appUrl, ConfigurationError, ffmpegBinary, type MediaConfig, mediaConfig, sessionSecret } from "./env";

/**
 * The media door: the storage of this deployment and the two signatures — a 300-second photo URL for one viewer, a
 * 300-second upload URL for one photo. With Bunny, the photo URL is the pull zone's (token authentication, the
 * Optimizer resizes to the signed `width`); with the local storage (development), it is the API's own
 * `/api/media/…` route, signed the same way. A storage key never leaves the server unsigned.
 */

const holder = globalThis as unknown as { __yasakiaStorage?: { key: string; storage: MediaStorage } };

export function mediaStorage(config: MediaConfig = mediaConfig()): MediaStorage {
  if (config.driver === "none") throw new ConfigurationError("MEDIA_STORAGE_PROVIDER", "is none on this deployment: photos are not available");
  const key = JSON.stringify(config);
  if (holder.__yasakiaStorage?.key !== key) {
    holder.__yasakiaStorage = { key, storage: config.driver === "bunny" ? bunnyStorage(config) : localStorage(config.dir) };
  }
  return holder.__yasakiaStorage.storage;
}

/** Points the media processing at the deployment's ffmpeg (once per process; cheap). */
export function prepareMediaProcessing(): void {
  setFfmpegBinary(ffmpegBinary());
}

/** The HMAC key of the API's own signatures (uploads, local media), derived from AUTH_SESSION_SECRET for this purpose only. */
export function mediaSecret(): string {
  return crypto.createHash("sha256").update(`yasakia-media:${sessionSecret()}`).digest("hex");
}

export interface SignedPhoto {
  url: string;
  width: number;
  expiresAt: string;
}

/** A photo URL for one viewer: the asked width snapped to the allowed ones, valid 300 seconds. */
export function signPhotoUrl(storageKey: string, askedWidth?: number | null, config: MediaConfig = mediaConfig()): SignedPhoto {
  if (config.driver === "none") throw new ConfigurationError("MEDIA_STORAGE_PROVIDER", "is none on this deployment: photos are not available");
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

/** The URL a phone PUTs one media message's bytes to — signed for that message with its own key (a photo's signature opens no message). */
export function signMessageUpload(messageId: string): { url: string; expiresAt: Date } {
  const { signature, expires } = signUpload({ photoId: messageId, secret: `${mediaSecret()}:message` });
  return { url: `${appUrl()}/api/uploads/messages/${messageId}?expires=${expires}&signature=${signature}`, expiresAt: new Date(expires * 1000) };
}

/** Whether a message upload URL's signature is valid and unexpired. */
export function verifyMessageUpload(messageId: string, expires: number, signature: string): boolean {
  return verifyUpload({ photoId: messageId, expires, signature, secret: `${mediaSecret()}:message` });
}

/**
 * A URL for one viewer to read a media message's file — 300 seconds, the pull zone's token (Bunny) or the API's own signed route
 * (development). No width: a video and a voice message are not resized.
 */
export function signMessageMediaUrl(storageKey: string, config: MediaConfig = mediaConfig()): SignedPhoto {
  if (config.driver === "none") throw new ConfigurationError("MEDIA_STORAGE_PROVIDER", "is none on this deployment: media are not available");
  const signed = config.driver === "bunny" ? signBunnyUrl({ hostname: config.pullZoneHostname, path: `/${storageKey}`, tokenKey: config.tokenKey }) : signLocalMediaUrl({ baseUrl: appUrl(), key: storageKey, width: 0, secret: mediaSecret() });
  return { url: signed.url, width: 0, expiresAt: new Date(signed.expires * 1000).toISOString() };
}
