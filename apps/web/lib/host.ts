/**
 * One app, two addresses. `APP_ADMIN_HOST` (admin.yasakia.com) names the host of the administration console; the same
 * deployment answers it through host-based ingress (no extra component, no extra cost). On the admin host only the admin
 * routes and what they need exist; on every other host the admin routes do not (404). Unset (local development): both
 * are open, so the whole app can be worked on at one address.
 */
export type HostKind = "admin" | "app" | "open";

export function adminHost(env: Record<string, string | undefined> = process.env): string | null {
  return env.APP_ADMIN_HOST?.trim().toLowerCase() || null;
}

export function hostKind(headers: Headers, env: Record<string, string | undefined> = process.env): HostKind {
  const admin = adminHost(env);
  if (!admin) return "open";
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  return host === admin ? "admin" : "app";
}

const LOCALE = /^\/(en|fr)(?=\/|$)/;

/** Paths are read without the app's base path (Next strips it). */
export const isAdminPath = (pathname: string) => /^\/(?:(?:en|fr)\/)?admin(?:\/|$)/.test(pathname) || pathname === "/api/admin" || pathname.startsWith("/api/admin/");

/** What the admin host serves: the sign-in page, the admin pages, the sign-in/out and admin APIs, the health check. */
export function allowedOnAdminHost(pathname: string): boolean {
  if (isAdminPath(pathname)) return true;
  if (pathname === "/api/healthz" || pathname.startsWith("/api/auth/") || pathname === "/api/events") return true;
  return LOCALE.test(pathname) && /^\/(en|fr)\/sign-in\/?$/.test(pathname);
}
