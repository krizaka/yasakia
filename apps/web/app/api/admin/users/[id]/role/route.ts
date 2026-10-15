import { z } from "zod";

import { setUserRole } from "@/lib/admin-users";
import { assertSameOrigin } from "@/lib/auth";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok, readJson, uuidParam } from "@/lib/http";

const Body = z.object({ role: z.enum(["USER", "ADMIN"]) }).strict();

/** Grants or withdraws the administrator role. Never on yourself; the last administrator keeps it. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin/users/role", async () => {
    const actor = await requireAdminActor(req);
    if (actor.id) assertSameOrigin(req);
    const { role } = await readJson(req, Body);
    await setUserRole(uuidParam((await ctx.params).id), role, actor, req.headers);
    return ok({ role });
  });
}
