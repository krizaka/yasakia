import { getAnalyticsReport } from "@/lib/analytics";
import { requireConsoleAdmin } from "@/lib/console-access";
import { handle, ok } from "@/lib/http";

/**
 * Returns aggregated behavioral, funnel, matching, and geospatial telemetry
 * powered by Orazaka Data Analysis and local high-velocity clustering.
 */
export async function GET(req: Request) {
  return handle("admin/analytics", async () => {
    await requireConsoleAdmin(req);
    const report = await getAnalyticsReport();
    return ok({ report });
  });
}
