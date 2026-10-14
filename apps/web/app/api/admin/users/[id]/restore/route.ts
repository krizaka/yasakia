import { restoreUser } from "@/lib/admin-users";
import { assertSameOrigin } from "@/lib/auth";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok, uuidParam } from "@/lib/http";

/** Lifts an account's suspension: it is ACTIVE again and can sign in; the restoration is logged. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin/users/restore", async () => {
    const actor = await requireAdminActor(req);
    if (actor.id) assertSameOrigin(req);
    const id = uuidParam((await ctx.params).id);
    await restoreUser(id, actor, req.headers);
    return ok({ restored: true });
  });
}
