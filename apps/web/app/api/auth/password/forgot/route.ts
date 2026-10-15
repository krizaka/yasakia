import { z } from "zod";

import { handle, ok, readJson } from "@/lib/http";
import { requestPasswordResetCode } from "@/lib/password-reset";
import { limitAction } from "@/lib/rate-limit";
import { normaliseEmail } from "@/lib/tokens";

const Body = z.object({
  email: z.string().trim().email().max(254),
  locale: z.enum(["en", "fr"]).default("en"),
});

/** "Forgot password": a reset code by e-mail, the same answer whether an account exists or not. 5 a hour per address, 20 per IP. */
export async function POST(req: Request) {
  return handle("auth/password/forgot", async () => {
    const body = await readJson(req, Body);
    const email = normaliseEmail(body.email);
    await limitAction("password-forgot", req, email, { perSubject: [5, 3600], perIp: [20, 3600] });
    await requestPasswordResetCode(email, body.locale);
    return ok({ sent: true, expiresInMinutes: 10 });
  });
}
