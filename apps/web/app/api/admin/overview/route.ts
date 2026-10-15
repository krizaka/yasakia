import { overview } from "@/lib/admin-console";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok } from "@/lib/http";

/** The console's overview: accounts by status, the moderation queue, introductions by state, open batches — counts only. */
export async function GET(req: Request) {
  return handle("admin/overview", async () => {
    await requireAdminActor(req);
    return ok(await overview());
  });
}
