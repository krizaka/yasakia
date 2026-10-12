import crypto from "node:crypto";

import { SIGNED_URL_TTL_SECONDS } from "./limits";

/**
 * URL signatures. A photo is never served by a raw URL: the API signs, for one viewer and 300 seconds, either a Bunny
 * pull-zone URL (token authentication, the Optimizer's `width` inside the signature) or — in development, with the
 * local storage — a URL of the API's own media route signed the same way with an HMAC.
 */

const base64url = (buffer: Buffer) => buffer.toString("base64").replace(/\n/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

const expiry = (now: number, ttlSeconds: number) => Math.floor(now / 1000) + ttlSeconds;

/**
 * A Bunny CDN URL signed with the pull zone's token authentication key (Bunny's "advanced" token: SHA-256 of key +
 * path + expires + the sorted query parameters, URL-safe base64). The parameters (here the Optimizer's `width`) are part
 * of the signature: a viewer cannot ask for another size, nor reuse the token for another file.
 */
export function signBunnyUrl(input: {
  hostname: string;
  path: string;
  tokenKey: string;
  params?: Record<string, string | number>;
  ttlSeconds?: number;
  now?: number;
}): { url: string; expires: number } {
  const expires = expiry(input.now ?? Date.now(), input.ttlSeconds ?? SIGNED_URL_TTL_SECONDS);
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
  const entries = Object.entries(input.params ?? {})
    .map(([k, v]) => [k, String(v)] as const)
    .filter(([, v]) => v !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const parameterData = entries.map(([k, v]) => `${k}=${v}`).join("&");
  const parameterUrl = entries.map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("");
  const token = base64url(crypto.createHash("sha256").update(`${input.tokenKey}${path}${expires}${parameterData}`).digest());
  return { url: `https://${input.hostname}${path}?token=${token}${parameterUrl}&expires=${expires}`, expires };
}

/** HMAC-SHA256 of a message, URL-safe base64. */
export function hmac(secret: string, message: string): string {
  return base64url(crypto.createHmac("sha256", secret).update(message).digest());
}

/** Constant-time comparison of two signatures. */
export function sameSignature(a: string, b: string): boolean {
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

/** The message a local media URL signs: the storage key, the width and the expiry. */
const localMessage = (key: string, width: number, expires: number) => `media:${key}:${width}:${expires}`;

/** A URL of the API's local media route (development storage), signed like a CDN URL would be. */
export function signLocalMediaUrl(input: { baseUrl: string; key: string; width: number; secret: string; ttlSeconds?: number; now?: number }): { url: string; expires: number } {
  const expires = expiry(input.now ?? Date.now(), input.ttlSeconds ?? SIGNED_URL_TTL_SECONDS);
  const token = hmac(input.secret, localMessage(input.key, input.width, expires));
  const base = input.baseUrl.replace(/\/$/, "");
  return { url: `${base}/api/media/${input.key}?width=${input.width}&expires=${expires}&token=${token}`, expires };
}

/** Whether a local media request carries a valid, unexpired signature. */
export function verifyLocalMediaToken(input: { key: string; width: number; expires: number; token: string; secret: string; now?: number }): boolean {
  if (!Number.isInteger(input.expires) || input.expires * 1000 <= (input.now ?? Date.now())) return false;
  return sameSignature(hmac(input.secret, localMessage(input.key, input.width, input.expires)), input.token);
}

/** The message an upload URL signs: the photo it is for and the expiry. */
const uploadMessage = (photoId: string, expires: number) => `upload:${photoId}:${expires}`;

/** The signature of a one-photo upload URL (valid 300 s). */
export function signUpload(input: { photoId: string; secret: string; ttlSeconds?: number; now?: number }): { signature: string; expires: number } {
  const expires = expiry(input.now ?? Date.now(), input.ttlSeconds ?? SIGNED_URL_TTL_SECONDS);
  return { signature: hmac(input.secret, uploadMessage(input.photoId, expires)), expires };
}

export function verifyUpload(input: { photoId: string; expires: number; signature: string; secret: string; now?: number }): boolean {
  if (!Number.isInteger(input.expires) || input.expires * 1000 <= (input.now ?? Date.now())) return false;
  return sameSignature(hmac(input.secret, uploadMessage(input.photoId, input.expires)), input.signature);
}
