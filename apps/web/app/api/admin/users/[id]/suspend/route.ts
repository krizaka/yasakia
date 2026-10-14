import { z } from "zod";

import { suspendUser } from "@/lib/admin-users";
import { assertSameOrigin } from "@/lib/auth";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok, readJson, uuidParam } from "@/lib/http";

const Body = z.object({ reason: z.string().trim().min(3).max(200) }).strict();

/** Suspends an account: it cannot sign in and every session of the app and the browser ends at once; the reason is logged. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin/users/suspend", async () => {
    const actor = await requireAdminActor(req);
    if (actor.id) assertSameOrigin(req);
    const id = uuidParam((await ctx.params).id);
    const { reason } = await readJson(req, Body);
    await suspendUser(id, actor, reason, req.headers);
    return ok({ suspended: true });
  });
}
