import { z } from "zod";

import { REPORT_STATUSES, reportDetails, setReportStatus } from "@/lib/admin-console";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok, readJson, uuidParam } from "@/lib/http";

const Body = z.object({ status: z.enum(REPORT_STATUSES) }).strict();

/** One report with its details opened — operators only. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin/report-queue/id", async () => {
    await requireAdminActor(req);
    return ok(await reportDetails(uuidParam((await ctx.params).id)), { headers: { "Cache-Control": "no-store" } });
  });
}

/** Moves a report along (REVIEWED · ACTIONED · DISMISSED, or back to OPEN); the decision is logged with who made it. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin/report-queue/id", async () => {
    const actor = await requireAdminActor(req);
    const { status } = await readJson(req, Body);
    await setReportStatus(uuidParam((await ctx.params).id), status, actor, req.headers);
    return ok({ status });
  });
}
