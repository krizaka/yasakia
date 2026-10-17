import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { handle, ok, readJson, uuidParam } from "@/lib/http";
import { sendIntroMessage } from "@/lib/intros";
import { limitAction } from "@/lib/rate-limit";

const Body = z.object({ body: z.string().trim().min(1).max(2000), clientId: z.string().min(8).max(64) }).strict();

/** Writes in an introduction while it is open (idempotent per `clientId`); the other person is told at once. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("intros/messages", async () => {
    const me = await requireUser(req);
    await limitAction("intro-message", req, me.id, { perSubject: [120, 3600], perIp: [300, 3600] });
    const { body, clientId } = await readJson(req, Body);
    return ok({ message: await sendIntroMessage(me.id, uuidParam((await ctx.params).id), body, clientId, new Date()) }, { status: 201 });
  });
}
