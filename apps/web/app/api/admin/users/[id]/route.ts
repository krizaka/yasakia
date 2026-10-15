import { z } from "zod";

import { eraseAccountForOperator } from "@/lib/admin-erase";
import { userDetail } from "@/lib/admin-users";
import { auditFor } from "@/lib/audit";
import { assertSameOrigin } from "@/lib/auth";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok, readJson, refuse, uuidParam } from "@/lib/http";

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

const Erase = z.object({ confirmEmail: z.string().trim().min(3).max(254) }).strict();

/** Law 25 erasure of an account, asked of an operator; the e-mail typed confirms. Never yourself, never an administrator. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("admin/users/erase", async () => {
    const actor = await requireAdminActor(req);
    if (actor.id) assertSameOrigin(req);
    const { confirmEmail } = await readJson(req, Erase);
    return ok(await eraseAccountForOperator(uuidParam((await ctx.params).id), confirmEmail, actor, req.headers));
  });
}
