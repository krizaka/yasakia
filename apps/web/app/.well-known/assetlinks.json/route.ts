import { assetLinks } from "@/lib/app-links";

/** Android App Links: served as JSON, no redirect, once the app's signing fingerprints are configured (else 404). */
export function GET() {
  const body = assetLinks();
  return body ? Response.json(body, { headers: { "cache-control": "public, max-age=3600" } }) : new Response("Not found", { status: 404 });
}
