/**
 * One flag decides whether this deployment is open to search engines: `APP_SEARCH_INDEXING=off` (every dev and preview
 * deployment; set at build and at run time) closes it — robots.txt `Disallow: /` with no sitemap, noindex on every page and
 * response (the app's proxy sends the header), and the « development environment » line in the footer. Production flips it
 * by configuration alone.
 */
export const indexable = (env: Record<string, string | undefined> = process.env): boolean => env.APP_SEARCH_INDEXING?.trim().toLowerCase() !== "off";
