import { revokeUserSessions } from "@/lib/admin-users";
import { assertSameOrigin } from "@/lib/auth";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok, uuidParam } from "@/lib/http";

/** Ends every session of an account, on the web and in the app, leaving it active. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin/users/sessions", async () => {
    const actor = await requireAdminActor(req);
    if (actor.id) assertSameOrigin(req);
    return ok(await revokeUserSessions(uuidParam((await ctx.params).id), actor, req.headers));
  });
}
