import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { openBatch } from "@/lib/batches";
import { aiProvider } from "@/lib/env";
import { handle, ok, readJson } from "@/lib/http";
import { limitAction } from "@/lib/rate-limit";

/** `locale`: the language of the page asking — the reasons are written in it (the account's language by default). */
const Body = z.object({ locale: z.enum(["en", "fr"]).optional() }).strict();

/** Opens the person's next batch — three to five people who fit both ways — once the agent has written their portrait; 409 `NO_FIT_YET` when nobody does. */
export async function POST(req: Request) {
  return handle("batches", async () => {
    const me = await requireUser(req);
    await limitAction("batch-open", req, me.id, { perSubject: [10, 3600], perIp: [30, 3600] });
    const { locale } = await readJson(req, Body);
    const ai = aiProvider();
    const batch = await openBatch(ai, { id: me.id, locale: locale ?? me.locale }, new Date());
    return ok({ batch }, { status: 201 });
  });
}
