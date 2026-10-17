import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { DebriefAnswers } from "@/lib/batch-rules";
import { submitDebrief } from "@/lib/batches";
import { handle, ok, readJson, uuidParam } from "@/lib/http";

const Body = z.object({ answers: DebriefAnswers }).strict();

/** The debrief of my answered batch — three questions, chips and a few words — then the agent may open the next batch. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("batches/debrief", async () => {
    const me = await requireUser(req);
    const { answers } = await readJson(req, Body);
    return ok(await submitDebrief(me.id, uuidParam((await ctx.params).id), answers, new Date()), { status: 201 });
  });
}
