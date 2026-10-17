import { after } from "next/server";
import { z } from "zod";

import { sendMessage, understand } from "@/lib/agent";
import { requireUser } from "@/lib/auth";
import { aiProvider } from "@/lib/env";
import { handle, ok, readJson } from "@/lib/http";
import { limitAction } from "@/lib/rate-limit";

/** `locale`: the language of the page the person writes from (the agent answers in the language they write in; the portrait is written in this one). */
const Body = z.object({ content: z.string(), locale: z.enum(["en", "fr"]).optional() }).strict();

/** Says something to the agent and gets its answer; what the agent understood of it follows (extraction, then the portrait when it knows enough). */
export async function POST(req: Request) {
  return handle("agent-message", async () => {
    const me = await requireUser(req);
    await limitAction("agent-message", req, me.id, { perSubject: [30, 3600], perIp: [60, 3600] });
    const { content, locale } = await readJson(req, Body);
    const ai = aiProvider();
    const now = new Date();
    const account = { id: me.id, locale: locale ?? me.locale };
    const { message, userMessageId } = await sendMessage(ai, account, content, now);
    after(() => understand(ai, account, userMessageId, new Date()));
    return ok({ message });
  });
}
