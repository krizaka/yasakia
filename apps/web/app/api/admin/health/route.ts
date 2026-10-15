import { healthReport } from "@/lib/admin-console";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The instance's health for the console: database, realtime bus, version, environment, uptime, whether sign-up is open. */
export async function GET(req: Request) {
  return handle("admin/health", async () => {
    await requireAdminActor(req);
    return ok(await healthReport(), { headers: { "Cache-Control": "no-store" } });
  });
}
