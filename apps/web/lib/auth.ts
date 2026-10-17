import { type AccountRole, accounts, db } from "@yasakia/db";
import { eq } from "drizzle-orm";

import { sessionSecret } from "./env";
import { HttpError } from "./http";
import { bearerToken, verifySessionToken } from "./tokens";
import { resolveWebSession, sessionTokenFrom } from "./web-session";

export interface AuthedAccount {
  id: string;
  email: string;
  status: "ACTIVE" | "PAUSED";
  locale: "en" | "fr";
  role: AccountRole;
  /** How the request proved who it is: the app's bearer token, or the web console's session cookie. */
  via: "bearer" | "cookie";
  /** The web session (cookie only). */
  sessionId?: string;
}

const unauthenticated = () => new HttpError(401, "Authentication required", { code: "UNAUTHENTICATED" });

/**
 * A request that changes something, sent with a cookie, must come from this origin (the cookie is SameSite=Lax; this is
 * the second lock): `Origin` equals the host, else the browser says `Sec-Fetch-Site: same-origin`. A bearer token needs
 * no such check — a page cannot make a browser add it.
 */
export function assertSameOrigin(req: Request): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host === host) return;
    } catch {
      /* falls through to the refusal */
    }
    throw new HttpError(403, "Cross-origin request refused", { code: "CROSS_ORIGIN" });
  }
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return;
  throw new HttpError(403, "Cross-origin request refused", { code: "CROSS_ORIGIN" });
}

/**
 * The account of the request — `Authorization: Bearer <token>` (the native app) or the web console's session cookie —
 * or a 401 / 403 HttpError. The bearer token is stateless, **authorisation is not**: the account is re-read on every
 * request, so a suspension (403), a deletion (401) or "sign out everywhere" (the session version moved: 401) applies at
 * once. A cookie session is a database row: revoked, expired or suspended, it is gone on the next request.
 * A PAUSED account keeps using the app; only the matching stops showing it.
 */
export async function requireUser(req: Request): Promise<AuthedAccount> {
  const authorization = req.headers.get("authorization");
  if (authorization) {
    const token = bearerToken(authorization);
    const claims = token ? verifySessionToken(token, sessionSecret()) : null;
    if (!claims) throw unauthenticated();
    const [account] = await db
      .select({ id: accounts.id, email: accounts.email, status: accounts.status, locale: accounts.locale, role: accounts.role, sessionVersion: accounts.sessionVersion })
      .from(accounts)
      .where(eq(accounts.id, claims.sub))
      .limit(1);
    if (!account || account.sessionVersion !== claims.v) throw unauthenticated();
    if (account.status === "SUSPENDED") throw new HttpError(403, "Account suspended", { code: "SUSPENDED" });
    return { id: account.id, email: account.email, status: account.status, locale: account.locale, role: account.role, via: "bearer" };
  }
  const session = await resolveWebSession(sessionTokenFrom(req.headers.get("cookie")));
  if (!session) throw unauthenticated();
  assertSameOrigin(req);
  return { ...session.account, via: "cookie", sessionId: session.sessionId };
}
