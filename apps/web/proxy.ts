import { type NextRequest, NextResponse } from "next/server";

/**
 * The three web pages exist in English and French (`/en/privacy`, `/fr/privacy`…). An address without a language —
 * the one the stores and the app link to, `/privacy` — goes to the visitor's: the one they chose (cookie `NEXT_LOCALE`,
 * set when they open a page in a language), else French when their browser prefers it, else English.
 * The API (`/api/*`) never passes here.
 */
const LOCALES = ["en", "fr"] as const;

function preferredLocale(request: NextRequest): (typeof LOCALES)[number] {
  const chosen = request.cookies.get("NEXT_LOCALE")?.value;
  if (chosen === "en" || chosen === "fr") return chosen;
  const accept = request.headers.get("accept-language") ?? "";
  const first = accept.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("fr") ? "fr" : "en";
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
