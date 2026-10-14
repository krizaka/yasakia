import { accounts, db } from "@yasakia/db";
import { eq } from "drizzle-orm";

import { sessionSecret } from "./env";
import { HttpError } from "./http";
import { bearerToken, verifySessionToken } from "./tokens";

export interface AuthedAccount {
  id: string;
  email: string;
  status: "ACTIVE" | "PAUSED";
  locale: "en" | "fr";
}

/**
 * The account of the request — `Authorization: Bearer <token>` (the native app; there is no cookie) — or a 401 / 403
 * HttpError. The token is stateless, **authorisation is not**: the account is re-read on every request, so a
 * suspension (403), a deletion (401) or "sign out everywhere" (the session version moved: 401) applies at once.
 * A PAUSED account keeps using the app; only the matching stops showing it.
 */
export async function requireUser(req: Request): Promise<AuthedAccount> {
  const token = bearerToken(req.headers.get("authorization"));
  const claims = token ? verifySessionToken(token, sessionSecret()) : null;
  if (!claims) throw new HttpError(401, "Authentication required", { code: "UNAUTHENTICATED" });
  const [account] = await db
    .select({ id: accounts.id, email: accounts.email, status: accounts.status, locale: accounts.locale, sessionVersion: accounts.sessionVersion })
    .from(accounts)
    .where(eq(accounts.id, claims.sub))
    .limit(1);
  if (!account || account.sessionVersion !== claims.v) throw new HttpError(401, "Authentication required", { code: "UNAUTHENTICATED" });
  if (account.status === "SUSPENDED") throw new HttpError(403, "Account suspended", { code: "SUSPENDED" });
  return { id: account.id, email: account.email, status: account.status, locale: account.locale };
}
