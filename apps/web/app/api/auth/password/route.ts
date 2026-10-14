import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { handle, readJson } from "@/lib/http";
import { checkPassword } from "@/lib/password-auth";
import { limitAction } from "@/lib/rate-limit";
import { normaliseEmail } from "@/lib/tokens";
import { createWebSession, sessionCookie } from "@/lib/web-session";

const Body = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

/**
 * Signs a person in to the web console with their e-mail and password: the answer sets an HttpOnly session cookie. The
 * same 401 answers a wrong address and a wrong password; 10 tries an hour per address and 30 per IP, then 429.
 */
export async function POST(req: Request) {
  return handle("auth/password", async () => {
    assertSameOrigin(req);
    const body = await readJson(req, Body);
    const email = normaliseEmail(body.email);
    await limitAction("auth-password", req, email, { perSubject: [10, 3600], perIp: [30, 3600] });
    const { account } = await checkPassword(email, body.password, req.headers);
    const token = await createWebSession(account.id, { userAgent: req.headers.get("user-agent"), ip: clientIp(req.headers) });
    const res = NextResponse.json({ success: true, account: { id: account.id, email: account.email, locale: account.locale, role: account.role } });
    res.headers.append("Set-Cookie", sessionCookie(token));
    return res;
  });
}
