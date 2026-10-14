import crypto from "node:crypto";

/**
 * Session tokens: stateless and signed (HMAC-SHA256 over the payload), for the native app only — it keeps the token in
 * the device's secure storage and sends it as `Authorization: Bearer <token>`. The web console has its own cookie sessions (lib/web-session.ts).
 * The token says who and which session version; **authorisation is not in it** — `requireUser` re-reads the account on
 * every request (lib/auth.ts), so a suspension, a deletion or "sign out everywhere" applies at once.
 */

export const TOKEN_PREFIX = "yz1";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionClaims {
  /** The account id. */
  sub: string;
  /** accounts.session_version when it was signed. */
  v: number;
  /** Expiry, seconds since epoch. */
  exp: number;
}

const sign = (data: string, secret: string) => crypto.createHmac("sha256", `session:${secret}`).update(data).digest("base64url");

export function signSessionToken(accountId: string, sessionVersion: number, secret: string, now = Date.now()): string {
  const claims: SessionClaims = { sub: accountId, v: sessionVersion, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS };
  const data = `${TOKEN_PREFIX}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  return `${data}.${sign(data, secret)}`;
}

/** The claims of a token, or null when it is malformed, forged or expired. */
export function verifySessionToken(token: string, secret: string, now = Date.now()): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as SessionClaims;
    if (typeof claims.sub !== "string" || typeof claims.v !== "number" || typeof claims.exp !== "number") return null;
    if (claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}

/** The token of an `Authorization: Bearer …` header, if there is one. */
export function bearerToken(authorization: string | null): string | undefined {
  return authorization?.match(/^Bearer\s+(yz1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/)?.[1];
}

/** A 6-digit sign-in code, uniformly drawn. */
export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** How a code is kept: a keyed hash bound to the address (a leaked table holds no usable code). */
export function hashCode(email: string, code: string, secret: string): string {
  return crypto.createHmac("sha256", `code:${secret}`).update(`${email}:${code}`).digest("hex");
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Lower-cased, trimmed — the one form an address is stored and compared in. */
export const normaliseEmail = (email: string) => email.trim().toLowerCase();
