import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// One .env for the whole monorepo, at its root. loadEnvFile never overrides a variable that is set, so the real
// environment (CI, production) always wins.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const packageVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
// package.json's version + the short commit DigitalOcean passes at build (APP_COMMIT_SHA), as the static site shows it.
const appVersion = process.env.APP_COMMIT_SHA ? `${packageVersion}+${process.env.APP_COMMIT_SHA.slice(0, 7)}` : packageVersion;
// dev.yasakia.com serves the static site at / and this app under /app (NEXT_PUBLIC_APP_BASE_PATH=/app); empty elsewhere.
const basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH?.trim() || "";
const production = process.env.NODE_ENV === "production";

/**
 * Content Security Policy of the three web pages (privacy, terms, account deletion) and of every API answer: nothing
 * but this origin — no third-party script, frame or font. Next renders inline bootstrap scripts without a nonce, so
 * scripts keep 'unsafe-inline'. Development adds what the dev server needs.
 */
// The landing's demo recordings and images come from the CDN (hashed files), nothing else outside this origin.
const CDN = "https://krizaka-assets.b-cdn.net";
// The person's own photos come from the private pull zone (token-authenticated, signed for one viewer, 300 s): its host is
// the one the API signs with (the pull zone setting of the media context).
const PHOTO_HOST = process.env.MEDIA_CDN_HOSTNAME?.trim();
const PHOTOS = PHOTO_HOST ? ` https://${PHOTO_HOST}` : "";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${CDN}${PHOTOS}`,
  `media-src 'self' blob: ${CDN}`,
  "font-src 'self' data:",
  `connect-src 'self'${production ? "" : " ws: http://localhost:* http://127.0.0.1:*"}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(production ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

/**
 * The public landing — English at `/`, French under `/fr`, plus `/how-it-works` and `/demo` — is a static export copied into
 * public/ (scripts/sync-site.mjs). A page address is mapped to its file; with and without a trailing slash, the export's canonical
 * URLs keep theirs (skipTrailingSlashRedirect).
 */
const LANDING_PAGES = ["", "how-it-works", "demo", "fr", "fr/how-it-works", "fr/demo"];
const landingRewrites = LANDING_PAGES.flatMap((page) => {
  const file = `/${page ? `${page}/` : ""}index.html`;
  return page ? [{ source: `/${page}`, destination: file }, { source: `/${page}/`, destination: file }] : [{ source: "/", destination: file }];
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  ...(basePath ? { basePath } : {}),
  // The end-to-end run (e2e/run.mjs) builds into its own folder, so it never collides with a `next dev` already running.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_APP_BASE_PATH: basePath,
  },
  transpilePackages: ["@yasakia/ai", "@yasakia/db", "@yasakia/matching", "@yasakia/media"],
  // Native and driver modules stay Node modules, required at run time: sharp (images), pg (the pool, LISTEN), ioredis
  // (@krizaka/realtime/redis — it connects only with REALTIME_BUS=redis).
  serverExternalPackages: ["sharp", "pg", "ioredis"],
  // The mail templates are read from disk at run time; the image copies them next to the server (deploy/docker/Dockerfile).
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return { beforeFiles: landingRewrites, afterFiles: [], fallback: [] };
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The administration host is never indexed (the landing, on the other host, is).
      { source: "/:path*", has: [{ type: "host", value: "admin\\..*" }], headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
