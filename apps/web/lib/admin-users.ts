import { accounts, agentSessions, batches, db, intros, profiles, reports, webSessions } from "@yasakia/db";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, or, type SQL, sql } from "drizzle-orm";

import { audit } from "./audit";
import { type AdminActor } from "./console-access";
import { refuse } from "./http";
import { hasPassword } from "./password-auth";
import { revokeWebSessions } from "./web-session";

/**
 * The administration console's view of people: a searchable, filterable, sortable, paged list (the DataTable's server
 * mode), one person's page, and the two actions an operator has — suspend and restore. Never the date of birth, a
 * message, a photo or a score: an operator sees who an account is and in what state, not what it said.
 */

export const USER_STATUSES = ["ACTIVE", "PAUSED", "SUSPENDED"] as const;
export const USER_ROLES = ["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const USER_SORTS = ["email", "createdAt", "lastSeenAt", "status"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export interface UserListQuery {
  search?: string;
  status?: string[];
  role?: string[];
  sort: UserSort;
  dir: "asc" | "desc";
  page: number;
  size: number;
}

export interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  status: (typeof USER_STATUSES)[number];
  role: (typeof USER_ROLES)[number];
  locale: "en" | "fr";
  createdAt: Date;
  lastSeenAt: Date | null;
}

const escapeLike = (value: string) => value.replace(/[%_\\]/g, (c) => `\\${c}`);

export async function listUsers(q: UserListQuery): Promise<{ rows: UserRow[]; total: number }> {
  const filters: (SQL | undefined)[] = [];
  const statuses = q.status?.filter((s): s is (typeof USER_STATUSES)[number] => (USER_STATUSES as readonly string[]).includes(s));
  const roles = q.role?.filter((r): r is (typeof USER_ROLES)[number] => (USER_ROLES as readonly string[]).includes(r));
  if (statuses?.length) filters.push(inArray(accounts.status, statuses));
  if (roles?.length) filters.push(inArray(accounts.role, roles));
  if (q.search) {
    const like = `%${escapeLike(q.search.trim())}%`;
    filters.push(or(ilike(accounts.email, like), ilike(profiles.displayName, like)));
  }
  const where = and(...filters);
  const column = { email: accounts.email, createdAt: accounts.createdAt, lastSeenAt: accounts.lastSeenAt, status: accounts.status }[q.sort];
  const order = q.dir === "asc" ? asc(column) : desc(column);
  const base = db.select({ total: count() }).from(accounts).leftJoin(profiles, eq(profiles.accountId, accounts.id)).where(where);
  const [{ total }] = await base;
  const rows = await db
    .select({
      id: accounts.id,
      email: accounts.email,
      displayName: profiles.displayName,
      status: accounts.status,
      role: accounts.role,
      locale: accounts.locale,
      createdAt: accounts.createdAt,
      lastSeenAt: accounts.lastSeenAt,
    })
    .from(accounts)
    .leftJoin(profiles, eq(profiles.accountId, accounts.id))
    .where(where)
    .orderBy(order, asc(accounts.id))
    .limit(q.size)
    .offset((q.page - 1) * q.size);
  return { rows, total };
}

export interface UserDetail extends UserRow {
  suspendedAt: Date | null;
  suspensionReason: string | null;
  agentState: string | null;
  hasPassword: boolean;
  counts: { batches: number; intros: number; openReportsAgainst: number; liveSessions: number };
}

export async function userDetail(id: string): Promise<UserDetail | null> {
  const [row] = await db
    .select({
      id: accounts.id,
      email: accounts.email,
      displayName: profiles.displayName,
      status: accounts.status,
      role: accounts.role,
      locale: accounts.locale,
      createdAt: accounts.createdAt,
      lastSeenAt: accounts.lastSeenAt,
      suspendedAt: accounts.suspendedAt,
      suspensionReason: accounts.suspensionReason,
      agentState: agentSessions.state,
    })
    .from(accounts)
    .leftJoin(profiles, eq(profiles.accountId, accounts.id))
    .leftJoin(agentSessions, eq(agentSessions.accountId, accounts.id))
    .where(eq(accounts.id, id))
    .limit(1);
  if (!row) return null;
  const [[b], [i], [r], [s]] = await Promise.all([
    db.select({ n: count() }).from(batches).where(eq(batches.accountId, id)),
    db.select({ n: count() }).from(intros).where(or(eq(intros.accountA, id), eq(intros.accountB, id))),
    db.select({ n: count() }).from(reports).where(and(eq(reports.reportedId, id), eq(reports.status, "OPEN"))),
    db.select({ n: count() }).from(webSessions).where(and(eq(webSessions.accountId, id), isNull(webSessions.revokedAt), gt(webSessions.expiresAt, sql`now()`))),
  ]);
  return { ...row, hasPassword: await hasPassword(id), counts: { batches: b.n, intros: i.n, openReportsAgainst: r.n, liveSessions: s.n } };
}

/**
 * Suspends an account: it cannot sign in, every session of the browser and of the app ends at once (the session
 * version moves, the web sessions are revoked), and the action is logged with who did it and why.
 */
export async function suspendUser(targetId: string, actor: AdminActor, reason: string, headers: Headers): Promise<void> {
  if (actor.id === targetId) throw refuse(409, "SELF", "You cannot suspend yourself");
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ role: accounts.role, status: accounts.status }).from(accounts).where(eq(accounts.id, targetId)).for("update").limit(1);
    if (!target) throw refuse(404, "NOT_FOUND", "Not found");
    if (target.role === "ADMIN") throw refuse(409, "TARGET_IS_ADMIN", "An administrator cannot be suspended from the console");
    if (target.status === "SUSPENDED") throw refuse(409, "ALREADY_SUSPENDED", "Already suspended");
    await tx
      .update(accounts)
      .set({ status: "SUSPENDED", suspendedAt: new Date(), suspensionReason: reason, sessionVersion: sql`${accounts.sessionVersion} + 1`, updatedAt: new Date() })
      .where(eq(accounts.id, targetId));
    await tx.update(webSessions).set({ revokedAt: new Date() }).where(and(eq(webSessions.accountId, targetId), isNull(webSessions.revokedAt)));
  });
  await audit({ action: "admin.suspend", actorId: actor.id, actorLabel: actor.label, targetId, detail: { reason: reason.slice(0, 200) }, headers });
}

/** Lifts a suspension: the account is ACTIVE again and can sign in. */
export async function restoreUser(targetId: string, actor: AdminActor, headers: Headers): Promise<void> {
  const rows = await db
    .update(accounts)
    .set({ status: "ACTIVE", suspendedAt: null, suspensionReason: null, updatedAt: new Date() })
    .where(and(eq(accounts.id, targetId), eq(accounts.status, "SUSPENDED")))
    .returning({ id: accounts.id });
  if (rows.length === 0) {
    const [exists] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, targetId)).limit(1);
    throw exists ? refuse(409, "NOT_SUSPENDED", "This account is not suspended") : refuse(404, "NOT_FOUND", "Not found");
  }
  await audit({ action: "admin.restore", actorId: actor.id, actorLabel: actor.label, targetId, headers });
}

/** What an operator may do to whom — pure, so the routes and the tests share it. Returns the refusal code, or null. */
export function adminActionRefusal(action: "revoke" | "role" | "delete", actorId: string | null, target: { id: string; role: UserRole }, admins: number, nextRole?: UserRole): "SELF" | "TARGET_IS_ADMIN" | "LAST_ADMIN" | null {
  if (actorId === target.id) return "SELF";
  if (action === "role" && target.role === "ADMIN" && nextRole === "USER" && admins <= 1) return "LAST_ADMIN";
  if (action === "delete" && target.role === "ADMIN") return "TARGET_IS_ADMIN";
  return null;
}

async function target(targetId: string): Promise<{ id: string; role: UserRole; email: string }> {
  const [row] = await db.select({ id: accounts.id, role: accounts.role, email: accounts.email }).from(accounts).where(eq(accounts.id, targetId)).limit(1);
  if (!row) throw refuse(404, "NOT_FOUND", "Not found");
  return row;
}

const countAdmins = async () => (await db.select({ n: count() }).from(accounts).where(and(eq(accounts.role, "ADMIN"), eq(accounts.status, "ACTIVE"))))[0].n;

/** Ends every session of an account — the browser's and the app's — without suspending it (a lost phone, a doubt). */
export async function revokeUserSessions(targetId: string, actor: AdminActor, headers: Headers): Promise<{ revoked: number }> {
  const who = await target(targetId);
  const refusal = adminActionRefusal("revoke", actor.id, who, 0);
  if (refusal) throw refuse(409, refusal, "You cannot do this to your own account");
  await db.update(accounts).set({ sessionVersion: sql`${accounts.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(accounts.id, targetId));
  const revoked = await revokeWebSessions(targetId);
  await audit({ action: "admin.sessions_revoked", actorId: actor.id, actorLabel: actor.label, targetId, detail: { revoked }, headers });
  return { revoked };
}

/** Grants or withdraws the administrator role. Never on yourself; the last administrator keeps it. */
export async function setUserRole(targetId: string, role: "USER" | "ADMIN", actor: AdminActor, headers: Headers): Promise<void> {
  const who = await target(targetId);
  if (who.role === role) return;
  const refusal = adminActionRefusal("role", actor.id, who, await countAdmins(), role);
  if (refusal) throw refuse(409, refusal, refusal === "LAST_ADMIN" ? "The last administrator keeps the role" : "You cannot do this to your own account");
  await db.update(accounts).set({ role, updatedAt: new Date() }).where(eq(accounts.id, targetId));
  await audit({ action: "admin.role", actorId: actor.id, actorLabel: actor.label, targetId, detail: { from: who.role, to: role }, headers });
}
