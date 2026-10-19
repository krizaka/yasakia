import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The version the site shows: package.json + the short commit. DigitalOcean passes the commit (APP_COMMIT_SHA); locally git knows it. */
const version = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
function shortSha() {
  const given = process.env.APP_COMMIT_SHA?.trim();
  if (given) return given.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "dev";
  }
}

/** The @krizaka/ui this build runs on, shown beside the version in the footer. */
function uiVersion() {
  try {
    return JSON.parse(readFileSync(new URL("./node_modules/@krizaka/ui/package.json", import.meta.url), "utf8")).version;
  } catch {
    return "";
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A static export, built here and served by the web service (one deployment, host-routed).
  output: "export",
  // The export is served by the web service (apps/web/public/site, scripts/sync-site.mjs): its chunks live under /site-assets
  // so they never meet the web app's own /_next.
  assetPrefix: "/site-assets",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  env: { APP_VERSION: `${version}+${shortSha()}`, APP_UI_VERSION: uiVersion() },
};

export default nextConfig;
