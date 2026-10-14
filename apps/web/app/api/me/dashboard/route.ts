import { requireUser } from "@/lib/auth";
import { dashboardDto, dashboardFor } from "@/lib/dashboard";
import { handle, ok } from "@/lib/http";

/** The signed-in account's home: where the agent is, the open batch, the introductions, the phones — counts and dates, never a person's profile or a score. */
export async function GET(req: Request) {
  return handle("me/dashboard", async () => {
    const me = await requireUser(req);
    return ok({ dashboard: dashboardDto(await dashboardFor(me.id)) });
  });
}
