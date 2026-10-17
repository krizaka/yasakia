import { qaResetRefusal, resetQaAgent } from "@yasakia/db";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { assertSameOrigin } from "@/lib/auth";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok, readJson, refuse } from "@/lib/http";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();

/**
 * Gives one QA account (`qa+…@`) a blank page again — the conversation, the portrait, the batches, the introductions —
 * so the journey can be shown or recorded from its start. Operators only; never a real person; never production.
 */
export async function POST(req: Request) {
  return handle("admin/qa-reset", async () => {
    const actor = await requireAdminActor(req);
    if (actor.id) assertSameOrigin(req);
    const { email } = await readJson(req, Body);
    const refusal = qaResetRefusal(email, process.env);
    if (refusal) throw refuse(422, "QA_RESET_REFUSED", refusal);
    if (!(await resetQaAgent(email))) throw refuse(404, "NOT_FOUND", "Not found");
    await audit({ action: "admin.qa_reset", actorId: actor.id, actorLabel: actor.label, detail: { email }, headers: req.headers });
    return ok({ reset: true });
  });
}
