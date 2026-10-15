import { type NextRequest, NextResponse } from "next/server";

import { allowedOnAdminHost, hostKind, isAdminPath, isLandingPath } from "@/lib/host";
import { indexable } from "@/lib/indexing";

/**
 * Four address spaces in one app. The public landing owns `/`, `/fr`, `/how-it-works`, `/demo` (static pages copied into
 * `public/site/` and served by the rewrites of next.config.mjs). The legal pages are `/{en|fr}/{privacy|terms|delete-account}`
 * (an address without a language goes to the visitor's). The signed-in console is `/app/{en|fr}/…`. The API is `/api/*`.
 * Host-based: on the admin host (APP_ADMIN_HOST) only the administration exists — its root opens the console's overview —
 * and on any other host the administration does not (404): see lib/host.ts.
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

function remember(request: NextRequest, locale: string) {
  if (request.cookies.get("NEXT_LOCALE")?.value === locale) return;
  const response = NextResponse.next();
  response.cookies.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return response;
}

/** Said on every response of a deployment closed to search engines: the console host always, every host when APP_SEARCH_INDEXING=off. */
export const NOINDEX_HEADER = "noindex, nofollow, noarchive";
export const CLOSED_ROBOTS = "User-agent: *\nDisallow: /\n";

export function proxy(request: NextRequest) {
  const response = route(request);
  // A route that answers nothing (`undefined`: let it through) still carries the header.
  const out = response ?? NextResponse.next();
  if (hostKind(request.headers) === "admin" || !indexable()) out.headers.set("x-robots-tag", NOINDEX_HEADER);
  return out;
}

function route(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;
  const kind = hostKind(request.headers);
  // Closed deployment: robots.txt disallows everything and advertises no sitemap; the sitemap does not exist.
  if (pathname === "/robots.txt" && (kind === "admin" || !indexable())) return new NextResponse(CLOSED_ROBOTS, { headers: { "Content-Type": "text/plain" } });
  if (pathname === "/sitemap.xml" && (kind === "admin" || !indexable())) return notFound();
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return;
  if (kind === "app" && isAdminPath(pathname)) return notFound();
  if (kind === "admin") {
    if (pathname === "/" || pathname === "/app" || /^\/app\/(en|fr)\/?$/.test(pathname)) {
      const locale = /^\/app\/(en|fr)/.test(pathname) ? pathname.slice(5, 7) : preferredLocale(request);
      return NextResponse.redirect(new URL(`/app/${locale}/admin`, request.url));
    }
    if (!allowedOnAdminHost(pathname)) return notFound();
  }
  if (pathname.startsWith("/api/")) return; // the API is never redirected to a language
  if (isLandingPath(pathname)) return; // the public landing: rewritten to its static page
  if (pathname === "/app" || pathname === "/app/") return NextResponse.redirect(new URL(`/app/${preferredLocale(request)}`, request.url));
  if (pathname.startsWith("/app/")) {
    const locale = pathname.split("/")[2];
    if ((LOCALES as readonly string[]).includes(locale)) return remember(request, locale);
    return NextResponse.redirect(new URL(`/app/${preferredLocale(request)}${pathname.slice(4)}`, request.url));
  }
  const segment = pathname.split("/")[1];
  if ((LOCALES as readonly string[]).includes(segment)) return remember(request, segment);
  return NextResponse.redirect(new URL(`/${preferredLocale(request)}${pathname}`, request.url));
}

export const config = {
  matcher: ["/api/:path*", "/robots.txt", "/sitemap.xml", "/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
