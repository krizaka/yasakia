import crypto from "node:crypto";

import { cookies, headers } from "next/headers";

import type { AuthedAccount } from "./auth";
import { requireUser } from "./auth";
import { clientIp } from "./client-ip";
import { adminAllowedIps, adminToken, consoleAllowedIps } from "./env";
import { HttpError } from "./http";
import { resolveWebSession, SESSION_COOKIE, type WebSessionContext } from "./web-session";

/**
 * Who may open the administration console, and how. Three locks, all required: a signed-in web session, the ADMIN role,
 * and an address on `AUTH_ALLOWED_IPS` (empty in production = nobody). A failed lock answers 404 on the pages — the
 * console does not announce itself — and 403 on the API.
 */

export function ipAllowedForConsole(requestHeaders: Headers, env: Record<string, string | undefined> = process.env): boolean {
  const allowed = consoleAllowedIps(env);
  if (allowed === null) return true;
  const ip = clientIp(requestHeaders, env);
  return !!ip && allowed.includes(ip);
}

/** The actor of an admin API call: an ADMIN account, or the operator service token (`operator-token`, no account). */
export interface AdminActor {
  id: string | null;
  label: string;
}

export async function requireConsoleAdmin(req: Request): Promise<AuthedAccount> {
  const me = await requireUser(req);
  if (me.via !== "cookie" || me.role !== "ADMIN") throw new HttpError(403, "Administrators only", { code: "FORBIDDEN" });
  if (!ipAllowedForConsole(req.headers)) throw new HttpError(403, "This address may not use the console", { code: "IP_NOT_ALLOWED" });
  return me;
}

/** An administrator signed in on the console, or the operator token (and its own address allow-list, as `/api/admin/reports`). */
export async function requireAdminActor(req: Request): Promise<AdminActor> {
  const header = req.headers.get("authorization") ?? "";
  const expected = adminToken();
  if (header.startsWith("Bearer ") && expected) {
    const given = header.slice(7).trim();
    const same = crypto.timingSafeEqual(crypto.createHash("sha256").update(given).digest(), crypto.createHash("sha256").update(expected).digest());
    if (same) {
      const allowed = adminAllowedIps();
      if (allowed !== null) {
        const ip = clientIp(req.headers);
        if (!ip || !allowed.includes(ip)) throw new HttpError(403, "This address may not use the admin API", { code: "IP_NOT_ALLOWED" });
      }
      return { id: null, label: "operator-token" };
    }
  }
  const me = await requireConsoleAdmin(req);
  return { id: me.id, label: me.email };
}

/** The signed-in web session of the page being rendered (a Server Component), or null. */
export async function pageSession(): Promise<WebSessionContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveWebSession(token && /^yw1\.[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined);
}

/** The page's administrator — session, role and address — or null (the caller answers 404). */
export async function pageAdmin(): Promise<WebSessionContext | null> {
  const session = await pageSession();
  if (!session || session.account.role !== "ADMIN") return null;
  return ipAllowedForConsole(await headers()) ? session : null;
}
