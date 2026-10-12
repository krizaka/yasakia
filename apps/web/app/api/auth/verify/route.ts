import { z } from "zod";

import { handle, ok, readJson } from "@/lib/http";
import { limitAction } from "@/lib/rate-limit";
import { verifyCode } from "@/lib/sign-in";
import { normaliseEmail } from "@/lib/tokens";

const Body = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().regex(/^\d{6}$/),
  /** The native app is the only client: the session comes back as a token, never as a cookie. */
  client: z.literal("native"),
  /** Required to create an account (YYYY-MM-DD, checked 18+ by the server); ignored for an existing one. */
  birthDate: z.string().optional(),
  acceptTerms: z.boolean().optional(),
  locale: z.enum(["en", "fr"]).default("en"),
});

/**
 * Exchanges an e-mail code for a session token (`client: "native"`, sent back as `Authorization: Bearer`). A new address
 * needs a date of birth that says 18+ (409 BIRTH_DATE_REQUIRED keeps the code valid; 403 UNDERAGE spends it) and the
 * terms accepted; 5 wrong codes and the code is dead.
 */
export async function POST(req: Request) {
  return handle("auth/verify", async () => {
    const body = await readJson(req, Body);
    const email = normaliseEmail(body.email);
    await limitAction("auth-verify", req, email, { perSubject: [10, 900], perIp: [60, 900] });
    const result = await verifyCode({ email, code: body.code, birthDate: body.birthDate, acceptTerms: body.acceptTerms, locale: body.locale });
    return ok({ token: result.token, created: result.created, account: result.account }, { status: result.created ? 201 : 200 });
  });
}
