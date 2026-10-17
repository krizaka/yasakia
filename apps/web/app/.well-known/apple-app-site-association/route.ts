import { appleAppSiteAssociation } from "@/lib/app-links";

/** Universal links: served as JSON, no redirect, once the iOS app's Team ID is configured (else 404). */
export function GET() {
  const body = appleAppSiteAssociation();
  return body ? Response.json(body, { headers: { "cache-control": "public, max-age=3600" } }) : new Response("Not found", { status: 404 });
}
