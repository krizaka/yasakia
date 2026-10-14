import { z } from "zod";

import { AUDIT_ACTIONS, listAudit } from "@/lib/audit";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok } from "@/lib/http";

const Query = z.object({
  search: z.string().trim().max(100).optional(),
  action: z
    .string()
    .transform((s) => s.split(",").filter((a): a is (typeof AUDIT_ACTIONS)[number] => (AUDIT_ACTIONS as readonly string[]).includes(a)))
    .optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  size: z.coerce.number().int().min(1).max(100).default(25),
});

/** The audit log for the console — sign-ins, password changes, suspensions, restorations, deletions — searched, filtered and paged on the server. */
export async function GET(req: Request) {
  return handle("admin/audit", async () => {
    await requireAdminActor(req);
    const query = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
    const { rows, total } = await listAudit({ ...query, sort: "createdAt" });
    return ok({ rows, total, page: query.page, size: query.size });
  });
}
