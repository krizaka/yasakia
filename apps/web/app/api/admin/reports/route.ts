import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { handle } from "@/lib/http";
import { listReports } from "@/lib/reports";

const Query = z.object({
  status: z.enum(["OPEN", "REVIEWED", "ACTIONED", "DISMISSED", "ALL"]).default("OPEN"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** The reports for operators — urgent reasons (UNDERAGE, THREAT) first, details decrypted; service token and IP allow-list. */
export async function GET(req: Request) {
  return handle("admin/reports", async () => {
    requireAdmin(req);
    const url = new URL(req.url);
    const query = Query.parse({ status: url.searchParams.get("status") ?? undefined, limit: url.searchParams.get("limit") ?? undefined });
    return NextResponse.json({ success: true, reports: await listReports(query.status, query.limit) }, { headers: { "Cache-Control": "no-store" } });
  });
}
