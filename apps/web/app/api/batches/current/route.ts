import { requireUser } from "@/lib/auth";
import { currentBatch } from "@/lib/batches";
import { handle, ok } from "@/lib/http";

/** The batch the person has to answer: who is in it, why you two in words both ways, until when — never a score. */
export async function GET(req: Request) {
  return handle("batches", async () => {
    const me = await requireUser(req);
    return ok({ batch: await currentBatch(me.id) });
  });
}
