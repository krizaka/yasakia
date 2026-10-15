import { z } from "zod";

import { handle, ok, readJson } from "@/lib/http";
import { resetPasswordWithCode } from "@/lib/password-reset";
import { limitAction } from "@/lib/rate-limit";
import { normaliseEmail } from "@/lib/tokens";

const Body = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(1).max(256),
});

/** The code and the new password. 10 tries per address and 30 per IP an hour. Every web session of the account ends. */
export async function POST(req: Request) {
  return handle("auth/password/reset", async () => {
    const body = await readJson(req, Body);
    const email = normaliseEmail(body.email);
    await limitAction("password-reset", req, email, { perSubject: [10, 3600], perIp: [30, 3600] });
    await resetPasswordWithCode({ email, code: body.code, password: body.password }, req.headers);
    return ok({ reset: true });
  });
}
