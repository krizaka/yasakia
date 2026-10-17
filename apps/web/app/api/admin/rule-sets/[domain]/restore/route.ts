import { z } from "zod";

import { assertSameOrigin } from "@/lib/auth";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok, readJson } from "@/lib/http";
import { parseRuleDomain, restoreRuleSet } from "@/lib/rule-sets";

const Body = z.object({ version: z.number().int().min(1), reason: z.string().trim().min(3).max(300) }).strict();

/** Rolls back: publishes the parameters of an earlier version again, as a new version (the history stays append-only). */
export async function POST(req: Request, ctx: { params: Promise<{ domain: string }> }) {
  return handle("admin/rule-sets/restore", async () => {
    const actor = await requireAdminActor(req);
    if (actor.id) assertSameOrigin(req);
    const domain = parseRuleDomain((await ctx.params).domain);
    const { version, reason } = await readJson(req, Body);
    return ok(await restoreRuleSet(domain, version, reason, actor, req.headers));
  });
}
