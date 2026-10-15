import { type NextRequest, NextResponse } from "next/server";

import { allowedOnAdminHost, hostKind, isAdminPath } from "@/lib/host";

/**
 * The three public pages and the console exist in English and French (`/en/…`, `/fr/…`); an address without a language goes
 * to the visitor's: the one they chose (cookie `NEXT_LOCALE`), else French when their browser prefers it, else English.
 * Host-based: on the admin host only the administration exists (its root opens the console's overview), and on any other
 * host the administration does not (404) — see lib/host.ts.
 */
const LOCALES = ["en", "fr"] as const;

function preferredLocale(request: NextRequest): (typeof LOCALES)[number] {
  const chosen = request.cookies.get("NEXT_LOCALE")?.value;
  if (chosen === "en" || chosen === "fr") return chosen;
  const accept = request.headers.get("accept-language") ?? "";
  const first = accept.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("fr") ? "fr" : "en";
}

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const kind = hostKind(request.headers);
  if (kind === "app" && isAdminPath(pathname)) return notFound();
  if (kind === "admin") {
    if (pathname === "/" || /^\/(en|fr)\/?$/.test(pathname)) {
      const locale = pathname === "/" ? preferredLocale(request) : pathname.slice(1, 3);
      return NextResponse.redirect(new URL(`/${locale}/admin`, request.url));
    }
    if (!allowedOnAdminHost(pathname)) return notFound();
  }
  if (pathname.startsWith("/api/")) return; // the API is never redirected to a language
  const segment = pathname.split("/")[1];
  if ((LOCALES as readonly string[]).includes(segment)) {
    if (request.cookies.get("NEXT_LOCALE")?.value === segment) return;
    const response = NextResponse.next();
    response.cookies.set("NEXT_LOCALE", segment, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return response;
  }
  return NextResponse.redirect(new URL(`/${preferredLocale(request)}${pathname === "/" ? "" : pathname}`, request.url));
}

export const config = {
  matcher: ["/api/admin/:path*", "/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
