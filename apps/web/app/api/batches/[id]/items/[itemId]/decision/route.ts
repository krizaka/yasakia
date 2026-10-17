import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { DECISIONS } from "@/lib/batch-rules";
import { decide } from "@/lib/batches";
import { aiProvider } from "@/lib/env";
import { handle, ok, readJson, uuidParam } from "@/lib/http";
import { limitAction } from "@/lib/rate-limit";

const Body = z.object({ decision: z.enum(DECISIONS) }).strict();

/** Answers one person of my batch: INTERESTED, PASS, or TELL_ME_MORE (once). Yes from both sides opens an introduction. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  return handle("batches/decision", async () => {
    const me = await requireUser(req);
    await limitAction("batch-decision", req, me.id, { perSubject: [120, 3600], perIp: [300, 3600] });
    const { id, itemId } = await ctx.params;
    const { decision } = await readJson(req, Body);
    return ok({ ...(await decide(aiProvider(), me.id, uuidParam(id), uuidParam(itemId), decision, new Date())) });
  });
}
