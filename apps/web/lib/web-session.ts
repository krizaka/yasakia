import crypto from "node:crypto";

import { type AccountRole, accounts, db, webSessions } from "@yasakia/db";
import { and, desc, eq, gt, isNull, lt, ne, or } from "drizzle-orm";

import { basePath, isProduction } from "./env";

/**
 * The browser sessions of the web console. The cookie carries an opaque random token (`yw1.<32 random bytes>`); the
 * database keeps only its SHA-256 — a leaked table holds no usable cookie. One row per device, so the account page
 * lists them and ends any of them; an account that is suspended, deleted or signed out everywhere (session_version
 * moved) loses them at once because the account is re-read on every request.
 * HttpOnly, SameSite=Lax, Secure in production, scoped to the app's path; 14 days, extended while it is used.
 */

export const SESSION_COOKIE = "yasakia_session";
export const WEB_SESSION_DAYS = 14;
const TOUCH_EVERY_MS = 60_000;

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const newToken = () => `yw1.${crypto.randomBytes(32).toString("base64url")}`;

export interface WebSessionContext {
  sessionId: string;
  account: { id: string; email: string; status: "ACTIVE" | "PAUSED"; locale: "en" | "fr"; role: AccountRole };
}

/** The cookie's value out of a `Cookie` header. */
export function sessionTokenFrom(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = rest.join("=");
      return /^yw1\.[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
    }
  }
  return undefined;
}

/** `Set-Cookie` for a new session, or for ending one (`token: null`). */
export function sessionCookie(token: string | null, env: Record<string, string | undefined> = process.env): string {
  const attrs = [`${SESSION_COOKIE}=${token ?? ""}`, `Path=${basePath(env) || "/"}`, "HttpOnly", "SameSite=Lax"];
  if (isProduction(env)) attrs.push("Secure");
  attrs.push(token ? `Max-Age=${WEB_SESSION_DAYS * 86_400}` : "Max-Age=0");
  return attrs.join("; ");
}

const trim = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : null);

export async function createWebSession(accountId: string, meta: { userAgent?: string | null; ip?: string | null }): Promise<string> {
  const token = newToken();
  await db.insert(webSessions).values({
    accountId,
    tokenHash: hashToken(token),
    userAgent: trim(meta.userAgent, 300),
    ip: trim(meta.ip, 64),
    expiresAt: new Date(Date.now() + WEB_SESSION_DAYS * 86_400_000),
  });
  return token;
}

/** The live session of a token (not revoked, not expired, its account not suspended), or null. */
export async function resolveWebSession(token: string | undefined): Promise<WebSessionContext | null> {
  if (!token) return null;
  const [row] = await db
    .select({
      sessionId: webSessions.id,
      lastSeenAt: webSessions.lastSeenAt,
      id: accounts.id,
      email: accounts.email,
      status: accounts.status,
      locale: accounts.locale,
      role: accounts.role,
    })
    .from(webSessions)
    .innerJoin(accounts, eq(accounts.id, webSessions.accountId))
    .where(and(eq(webSessions.tokenHash, hashToken(token)), isNull(webSessions.revokedAt), gt(webSessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.status === "SUSPENDED") return null;
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db
      .update(webSessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + WEB_SESSION_DAYS * 86_400_000) })
      .where(eq(webSessions.id, row.sessionId));
  }
  return { sessionId: row.sessionId, account: { id: row.id, email: row.email, status: row.status, locale: row.locale, role: row.role } };
}

export interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  current: boolean;
}

/** The account's live sessions, newest use first. */
export async function listWebSessions(accountId: string, currentId: string | null): Promise<SessionRow[]> {
  const rows = await db
    .select({ id: webSessions.id, userAgent: webSessions.userAgent, ip: webSessions.ip, createdAt: webSessions.createdAt, lastSeenAt: webSessions.lastSeenAt })
    .from(webSessions)
    .where(and(eq(webSessions.accountId, accountId), isNull(webSessions.revokedAt), gt(webSessions.expiresAt, new Date())))
    .orderBy(desc(webSessions.lastSeenAt));
  return rows.map((r) => ({ ...r, current: r.id === currentId }));
}

/** Ends one session of the account (another account's id ends nothing). Returns whether one ended. */
export async function revokeWebSession(accountId: string, sessionId: string): Promise<boolean> {
  const rows = await db
    .update(webSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(webSessions.id, sessionId), eq(webSessions.accountId, accountId), isNull(webSessions.revokedAt)))
    .returning({ id: webSessions.id });
  return rows.length > 0;
}

/** Ends every session of the account, except `keepId` when given. */
export async function revokeWebSessions(accountId: string, keepId?: string | null): Promise<number> {
  const rows = await db
    .update(webSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(webSessions.accountId, accountId), isNull(webSessions.revokedAt), keepId ? ne(webSessions.id, keepId) : undefined))
    .returning({ id: webSessions.id });
  return rows.length;
}

/** Removes sessions that can no longer be used (the background loop). */
export async function sweepWebSessions(now = new Date()): Promise<number> {
  const rows = await db
    .delete(webSessions)
    .where(or(lt(webSessions.expiresAt, now), lt(webSessions.revokedAt, new Date(now.getTime() - 7 * 86_400_000))))
    .returning({ id: webSessions.id });
  return rows.length;
}

/** A short, human reading of a User-Agent (« Safari · macOS ») — display only, the string is the browser's word. */
export function describeAgent(userAgent: string | null): { browser: string; system: string } {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  const system = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return { browser, system };
}
