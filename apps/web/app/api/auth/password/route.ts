import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { sessionSecret } from "@/lib/env";
import { handle, ok, readJson } from "@/lib/http";
import { checkPassword } from "@/lib/password-auth";
import { limitAction } from "@/lib/rate-limit";
import { normaliseEmail, signSessionToken } from "@/lib/tokens";
import { createWebSession, sessionCookie } from "@/lib/web-session";

const Body = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
  /** `native`: the app — the session comes back as a token (`Authorization: Bearer`), never as a cookie. */
  client: z.literal("native").optional(),
});

/**
 * Signs a person in with their e-mail and password: the web console gets an HttpOnly session cookie, the app
 * (`client: "native"`) a bearer token — the e-mail sign-in of krizaka/.github#76 for accounts that have a password. The
 * same 401 answers a wrong address and a wrong password; 10 tries an hour per address and 30 per IP, then 429.
 */
export async function POST(req: Request) {
  return handle("auth/password", async () => {
    const body = await readJson(req, Body);
    // A cookie is set only for the web: there, the request must come from this origin. A token needs no such lock.
    if (body.client !== "native") assertSameOrigin(req);
    const email = normaliseEmail(body.email);
    await limitAction("auth-password", req, email, { perSubject: [10, 3600], perIp: [30, 3600] });
    const { account } = await checkPassword(email, body.password, req.headers);
    if (body.client === "native") return ok({ token: signSessionToken(account.id, account.sessionVersion, sessionSecret()), account: { id: account.id, email: account.email, locale: account.locale } });
    const token = await createWebSession(account.id, { userAgent: req.headers.get("user-agent"), ip: clientIp(req.headers) });
    const res = NextResponse.json({ success: true, account: { id: account.id, email: account.email, locale: account.locale, role: account.role } });
    res.headers.append("Set-Cookie", sessionCookie(token));
    return res;
  });
}
