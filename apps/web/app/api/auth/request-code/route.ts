import { z } from "zod";

import { handle, ok, readJson } from "@/lib/http";
import { limitAction } from "@/lib/rate-limit";
import { requestCode } from "@/lib/sign-in";
import { normaliseEmail } from "@/lib/tokens";

const Body = z.object({
  email: z.string().trim().email().max(254),
  /** The language of the e-mail for a new address (an existing account's own language wins). */
  locale: z.enum(["en", "fr"]).default("en"),
});

/**
 * Sends a 6-digit sign-in code to an e-mail address — the same answer whether an account exists or not. Limited to 5
 * codes an hour per address and 20 per IP; in production without Mailgun it answers 503 (fail-closed).
 */
export async function POST(req: Request) {
  return handle("auth/request-code", async () => {
    const body = await readJson(req, Body);
    const email = normaliseEmail(body.email);
    await limitAction("auth-code", req, email, { perSubject: [5, 3600], perIp: [20, 3600] });
    await requestCode(email, body.locale);
    return ok({ sent: true, expiresInMinutes: 10 });
  });
}
