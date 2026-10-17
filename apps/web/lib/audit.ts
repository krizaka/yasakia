import { auditLog, db } from "@yasakia/db";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";

import { clientIp } from "./client-ip";

/**
 * The audit log: who did what, to whom, from where. Append-only, ids and a few words — never a password, a code, a
 * message or a photo. `account.deleted` is written without the person's address; deleting an account also blanks
 * their address from every line they acted in (lib/account.ts).
 */

export const AUDIT_ACTIONS = ["auth.sign_in", "auth.sign_in_refused", "auth.sign_out", "auth.password_changed", "auth.password_reset", "account.deleted", "admin.suspend", "admin.restore", "admin.report", "admin.sessions_revoked", "admin.role", "admin.delete", "admin.rules_published", "admin.qa_reset"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  /** An address or `operator-token`. */
  actorLabel?: string | null;
  targetId?: string | null;
  detail?: Record<string, string | number | boolean | null>;
  headers?: Headers;
}

export async function audit(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    action: entry.action,
    actorId: entry.actorId ?? null,
    actorLabel: entry.actorLabel ?? null,
    targetId: entry.targetId ?? null,
    detail: entry.detail ?? null,
    ip: entry.headers ? clientIp(entry.headers) : null,
  });
}

export interface AuditQuery {
  search?: string;
  action?: string[];
  sort?: "createdAt";
  dir?: "asc" | "desc";
  page: number;
  size: number;
}

export interface AuditRow {
  id: string;
  action: string;
  actor: string | null;
  targetId: string | null;
  detail: Record<string, string | number | boolean | null> | null;
  ip: string | null;
  createdAt: Date;
}

export async function listAudit(q: AuditQuery): Promise<{ rows: AuditRow[]; total: number }> {
  const filters: (SQL | undefined)[] = [];
  if (q.action?.length) filters.push(or(...q.action.map((a) => eq(auditLog.action, a))));
  if (q.search) {
    const like = `%${q.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    filters.push(or(ilike(auditLog.actorLabel, like), ilike(auditLog.action, like), ilike(auditLog.ip, like)));
  }
  const where = and(...filters);
  const [{ total }] = await db.select({ total: count() }).from(auditLog).where(where);
  const rows = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(q.dir === "asc" ? auditLog.createdAt : desc(auditLog.createdAt))
    .limit(q.size)
    .offset((q.page - 1) * q.size);
  return {
    total,
    rows: rows.map((r) => ({ id: r.id, action: r.action, actor: r.actorLabel, targetId: r.targetId, detail: r.detail, ip: r.ip, createdAt: r.createdAt })),
  };
}

/** The lines about one account (admin detail page), newest first. */
export async function auditFor(targetId: string, limit = 20): Promise<AuditRow[]> {
  const rows = await db.select().from(auditLog).where(eq(auditLog.targetId, targetId)).orderBy(desc(auditLog.createdAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, action: r.action, actor: r.actorLabel, targetId: r.targetId, detail: r.detail, ip: r.ip, createdAt: r.createdAt }));
}
