import crypto from "node:crypto";

/**
 * Passwords of the web console: salted scrypt (N = 2^15, r = 8, p = 1, 64-byte key), stored as
 * `scrypt$N$r$p$<salt>$<hash>` so the cost can rise later and old hashes still verify. Compared in constant time.
 * A password is never logged, never returned, never kept in clear.
 */

const N = 32_768;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAXMEM = 128 * N * R * 2;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

const derive = (password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    crypto.scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N: n, r, p, maxmem: 128 * n * r * 2 + MAXMEM }, (error, key) => (error ? reject(error) : resolve(key))),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const given = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** A hash to compare against when the address has no account, so an unknown address costs the same time as a wrong password. */
let decoy: Promise<string> | undefined;
export const decoyHash = () => (decoy ??= hashPassword(crypto.randomBytes(18).toString("base64url")));

/** What makes a password acceptable: long, not a single repeated character. The reason is a stable code the page words. */
export function passwordProblem(password: string): "TOO_SHORT" | "TOO_LONG" | "TOO_SIMPLE" | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "TOO_SHORT";
  if (password.length > PASSWORD_MAX_LENGTH) return "TOO_LONG";
  if (new Set(password).size < 5) return "TOO_SIMPLE";
  return null;
}
