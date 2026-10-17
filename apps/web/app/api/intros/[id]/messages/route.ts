import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { MessageSignals } from "@/lib/authenticity-rules";
import { aiProvider } from "@/lib/env";
import { handle, ok, readJson, uuidParam } from "@/lib/http";
import { sendIntroMessage } from "@/lib/intros";
import { judgeMessageSignal } from "@/lib/message-signals";
import { limitAction } from "@/lib/rate-limit";

const Body = z.object({ body: z.string().trim().min(1).max(2000), clientId: z.string().min(8).max(64), signals: MessageSignals.optional() }).strict();

/**
 * Writes in an introduction while it is open (idempotent per `clientId`); the other person is told at once. `signals` are the
 * composer's counters (how the message arrived — typing time, characters typed and pasted); with the text read by Orazaka's
 * classifier they make the message's authenticity signal, which arrives a moment later and never holds the message back.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("intros/messages", async () => {
    const me = await requireUser(req);
    await limitAction("intro-message", req, me.id, { perSubject: [120, 3600], perIp: [300, 3600] });
    const { body, clientId, signals } = await readJson(req, Body);
    const message = await sendIntroMessage(me.id, uuidParam((await ctx.params).id), body, clientId, new Date(), signals);
    // The message is gone to its reader already; its signal is read in the background (no engine configured: from how it arrived alone, later).
    void (async () => judgeMessageSignal(aiProvider(), message.id, me.locale))().catch(() => undefined);
    return ok({ message }, { status: 201 });
  });
}
