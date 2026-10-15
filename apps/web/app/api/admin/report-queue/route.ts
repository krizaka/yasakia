import { z } from "zod";

import { listReportQueue } from "@/lib/admin-console";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok } from "@/lib/http";

const list = z.string().transform((s) => s.split(",").filter(Boolean).slice(0, 4));
const Query = z.object({
  status: list.optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  size: z.coerce.number().int().min(1).max(100).default(25),
});

/** The moderation queue for the console — urgent reasons (UNDERAGE, THREAT) first while open — filtered by status and paged on the server; details open one report at a time. */
export async function GET(req: Request) {
  return handle("admin/report-queue", async () => {
    await requireAdminActor(req);
    const query = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
    return ok({ ...(await listReportQueue(query)), page: query.page, size: query.size });
  });
}
