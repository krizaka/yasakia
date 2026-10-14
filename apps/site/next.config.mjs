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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A static site: no server, no API, no database — what DigitalOcean serves for free.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  env: { APP_VERSION: `${version}+${shortSha()}` },
};

export default nextConfig;
