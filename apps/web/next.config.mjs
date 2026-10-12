import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// One .env for the whole monorepo, at its root. loadEnvFile never overrides a variable that is set, so the real
// environment (CI, production) always wins.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const appVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
const production = process.env.NODE_ENV === "production";

/**
 * Content Security Policy of the three web pages (privacy, terms, account deletion) and of every API answer: nothing
 * but this origin — no third-party script, frame or font. Next renders inline bootstrap scripts without a nonce, so
 * scripts keep 'unsafe-inline'. Development adds what the dev server needs.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // The end-to-end run (e2e/run.mjs) builds into its own folder, so it never collides with a `next dev` already running.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  transpilePackages: ["@yazakia/db", "@yazakia/media"],
  // Native and driver modules stay Node modules, required at run time: sharp (images), pg (the pool, LISTEN), ioredis
  // (@krizaka/realtime/redis — it connects only with REALTIME_BUS=redis).
  serverExternalPackages: ["sharp", "pg", "ioredis"],
  // The mail templates are read from disk at run time; the image copies them next to the server (deploy/docker/Dockerfile).
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
