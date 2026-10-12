import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { limitAction } from "@/lib/rate-limit";
import { fileReport, REPORT_REASONS } from "@/lib/reports";

const Body = z
  .object({
    accountId: z.string().uuid(),
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(2000).optional(),
    photoId: z.string().uuid().optional(),
    introId: z.string().uuid().optional(),
  })
  .strict();

/**
 * Reports someone, with a normalised reason — persisted before it is acknowledged, the details encrypted at rest, a
 * report inside an intro freezes it. The reported person is never told.
 */
export async function POST(req: Request) {
  return handle("reports", async () => {
    const me = await requireUser(req);
    await limitAction("report", req, me.id, { perSubject: [20, 3600] });
    const body = await readJson(req, Body);
    const report = await fileReport(me.id, {
      accountId: body.accountId.toLowerCase(),
      reason: body.reason,
      details: body.details,
      photoId: body.photoId?.toLowerCase(),
      introId: body.introId?.toLowerCase(),
    });
    return ok({ report: { id: report.id, createdAt: report.createdAt } }, { status: 201 });
  });
}
