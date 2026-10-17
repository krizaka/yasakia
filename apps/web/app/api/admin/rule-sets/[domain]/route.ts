import { z } from "zod";

import { assertSameOrigin } from "@/lib/auth";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok, readJson } from "@/lib/http";
import { parseRuleDomain, publishRuleSet } from "@/lib/rule-sets";

const Body = z.object({ params: z.record(z.string(), z.unknown()), reason: z.string().trim().min(3).max(300) }).strict();

/** Publishes a new version of a rule set — checked against its bounds, with a reason, audited; it is active at once. */
export async function POST(req: Request, ctx: { params: Promise<{ domain: string }> }) {
  return handle("admin/rule-sets/publish", async () => {
    const actor = await requireAdminActor(req);
    if (actor.id) assertSameOrigin(req);
    const domain = parseRuleDomain((await ctx.params).domain);
    const { params, reason } = await readJson(req, Body);
    return ok(await publishRuleSet(domain, params, reason, actor, req.headers));
  });
}
