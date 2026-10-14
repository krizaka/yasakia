import { userDetail } from "@/lib/admin-users";
import { auditFor } from "@/lib/audit";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok, refuse, uuidParam } from "@/lib/http";

/** One account for the console: state, role, counts and the audit lines about it — never a date of birth, a message or a photo. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin/users/id", async () => {
    await requireAdminActor(req);
    const id = uuidParam((await ctx.params).id);
    const user = await userDetail(id);
    if (!user) throw refuse(404, "NOT_FOUND", "Not found");
    return ok({ user, audit: await auditFor(id) });
  });
}
