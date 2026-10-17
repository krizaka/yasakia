import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { listIntros } from "@/lib/intros";

/** My introductions — the people who said yes to me as I said yes to them — the live ones first. */
export async function GET(req: Request) {
  return handle("intros", async () => {
    const me = await requireUser(req);
    return ok({ intros: await listIntros(me.id) });
  });
}
