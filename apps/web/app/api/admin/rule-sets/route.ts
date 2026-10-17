import { requireAdminActor } from "@/lib/console-access";
import { handle, ok } from "@/lib/http";
import { ruleSetHistory } from "@/lib/rule-sets";

/** Every version of the rule sets the app reads (MATCHING, AGENT), newest first, the active one marked. */
export async function GET(req: Request) {
  return handle("admin/rule-sets", async () => {
    await requireAdminActor(req);
    return ok({ ruleSets: await ruleSetHistory() });
  });
}
