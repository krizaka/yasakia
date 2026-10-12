import { z } from "zod";

import { blockAccount, listBlocks } from "@/lib/account";
import { requireUser } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { limitAction } from "@/lib/rate-limit";

const Body = z.object({ accountId: z.string().uuid() }).strict();

/** The people the account blocked (the settings list), oldest first. */
export async function GET(req: Request) {
  return handle("blocks", async () => {
    const me = await requireUser(req);
    return ok({ blocks: await listBlocks(me.id) });
  });
}

/**
 * Blocks someone — immediate, invisible to them, mutual in effect: their intro closes and each leaves the other's
 * current batch. Blocking twice answers the same block.
 */
export async function POST(req: Request) {
  return handle("blocks", async () => {
    const me = await requireUser(req);
    await limitAction("block", req, me.id, { perSubject: [60, 3600] });
    const body = await readJson(req, Body);
    const result = await blockAccount(me.id, body.accountId.toLowerCase());
    return ok({ block: result.block }, { status: result.created ? 201 : 200 });
  });
}
