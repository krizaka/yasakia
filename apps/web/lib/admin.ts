import crypto from "node:crypto";

import { clientIp } from "./client-ip";
import { adminAllowedIps, adminToken } from "./env";
import { HttpError } from "./http";

/**
 * The operators' door to `/api/admin/*` (V1 has no console: `npm run ops` and curl call it). Two locks, both required:
 * the service token `YAZAKIA_ADMIN_API_TOKEN` (32+ characters) as `Authorization: Bearer`, compared in constant time,
 * and the caller's address in `ADMIN_ALLOWED_IPS` (read as lib/client-ip.ts trusts it). Without a token configured no
 * admin route answers; in production an empty allow-list lets nobody in (fail-closed).
 */
export function requireAdmin(req: Request): void {
  const expected = adminToken();
  if (!expected) throw new HttpError(503, "The admin API is not configured", { code: "ADMIN_DISABLED" });
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const same = crypto.timingSafeEqual(crypto.createHash("sha256").update(given).digest(), crypto.createHash("sha256").update(expected).digest());
  if (!given || !same) throw new HttpError(401, "Invalid operator token", { code: "UNAUTHENTICATED" });
  const allowed = adminAllowedIps();
  if (allowed !== null) {
    const ip = clientIp(req.headers);
    if (!ip || !allowed.includes(ip)) throw new HttpError(403, "This address may not use the admin API", { code: "IP_NOT_ALLOWED" });
  }
}
