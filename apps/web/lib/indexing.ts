/**
 * One flag decides whether this deployment is open to search engines: `APP_SEARCH_INDEXING=off` (every dev and preview
 * deployment; set at build and at run time) closes it — robots.txt `Disallow: /` with no sitemap, noindex on every page and
 * response (the app's proxy sends the header), and the « development environment » line in the footer. Production flips it
 * by configuration alone.
 */
export const indexable = (env: Record<string, string | undefined> = process.env): boolean => env.APP_SEARCH_INDEXING?.trim().toLowerCase() !== "off";

/* --- Two addresses, one app (epic krizaka/.github#119, krizaka-com AGENTS section 2.4) ---
   www.<product>.com (NEXT_PUBLIC_APP_URL) is the public face and is indexed. dev.<product>.com (APP_DEV_HOST) is the
   development address: nothing of it is indexed, every HTML page goes to www with a 308, and only what is called
   keeps serving there (the API, auth callbacks, webhooks, /.well-known, /healthz) - with noindex. APP_SEARCH_INDEXING=off
   keeps its other meanings (the development notice, the non-licensed sources); it no longer closes the public host. */
const bare = (host: string | null | undefined) => (host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
export const publicHost = (env: Record<string, string | undefined> = process.env): string => {
  try {
    return bare(new URL(env.NEXT_PUBLIC_APP_URL ?? "https://www.yasakia.com").host);
  } catch {
    return "";
  }
};
/** Whether a response to this host may be indexed. */
export const indexableOn = (host: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean => indexable(env) || bare(host) === publicHost(env);
export const isDevHost = (host: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean => !!env.APP_DEV_HOST?.trim() && bare(host) === bare(env.APP_DEV_HOST);

/** What the dev host keeps serving: robots.txt, /healthz, the API (auth callbacks, webhooks, the mobile apps' calls) and /.well-known. */
const DEV_KEEPS = ["/api/", "/.well-known/"];
const DEV_KEEPS_EXACT = ["/robots.txt", "/healthz"];
/** The www address a dev-host request goes to (308), or null when the dev host keeps serving it. Only GET and HEAD are pages. */
export function devRedirect(method: string, pathname: string, search: string, publicUrl: string): string | null {
  if (method !== "GET" && method !== "HEAD") return null;
  if (DEV_KEEPS_EXACT.includes(pathname) || DEV_KEEPS.some((p) => pathname.startsWith(p))) return null;
  return `${publicUrl.replace(/\/$/, "")}${pathname}${search}`;
}
