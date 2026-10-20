/**
 * Every environment variable of Yasakia, declared once: its bounded context, whether production needs it, whether it is
 * a secret, a zod schema and what it does. Names follow the Krizaka convention (krizaka/.github#46): `<CONTEXT>_<THING>`
 * — never the product nor a vendor (a vendor is a value: `MEDIA_STORAGE_PROVIDER=bunny`, `MAIL_PROVIDER=mailgun`);
 * `NEXT_PUBLIC_` only where the browser needs it. docs/DEPLOYMENT.md's tables are generated from this list
 * (`npm run docs:generate`), env.test.ts refuses an undeclared or misnamed variable, and lib/env.ts
 * `assertProductionConfig` checks every value set against its schema before a production server starts.
 * Only zod here: the docs generator imports this file on its own.
 */
import { z } from "zod";

export const ENV_CONTEXTS = {
  APP: "Application — public URL, environment, background loops",
  DATABASE: "Database — PostgreSQL 16 + pgvector, encryption at rest",
  AUTH: "Authentication — sessions",
  MEDIA: "Media — photo storage, CDN, moderation",
  MAIL: "E-mail — sign-in codes, deletion confirmation",
  PUSH: "Mobile push",
  REALTIME: "Realtime — events stream",
  ABUSE: "Abuse defences — rate limits, client address",
  AI: "AI — Orazaka, the only way to a model",
  OPERATOR: "Operator — the admin API",
} as const;
export type EnvContext = keyof typeof ENV_CONTEXTS;
export type EnvNeed = "required" | "recommended" | "optional";

export interface EnvVar {
  name: string;
  context: EnvContext;
  need: EnvNeed;
  secret?: boolean;
  build?: boolean;
  default?: string;
  doc: string;
  schema: z.ZodTypeAny;
}

const text = z.string().min(1);
const url = z.string().url();
const onOff = z.enum(["on", "off"]);
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const v = (name: string, context: EnvContext, need: EnvNeed, schema: z.ZodTypeAny, doc: string, extra: Partial<EnvVar> = {}): EnvVar => ({ name, context, need, schema, doc, ...extra });

export const ENV_VARS: readonly EnvVar[] = [
  v("NEXT_PUBLIC_APP_URL", "APP", "required", url, "Public origin of the API: signed upload URLs and local media URLs are built on it.", { build: true, default: "http://localhost:3000" }),
  v("APP_ADMIN_HOST", "APP", "optional", text, "The host of the administration console (admin.yasakia.com): the same deployment answers it through host-based ingress; there only the administration exists, elsewhere it does not (404). Unset: both at one address (local development)."),
  v("APP_IOS_TEAM_ID", "APP", "optional", z.string().regex(/^[A-Z0-9]{10}$/, "an Apple Team ID: 10 capitals or digits"), "The Apple Team ID of yasakia-mobile: `/.well-known/apple-app-site-association` is served only when it is set (universal links, krizaka/.github#81)."),
  v("APP_ANDROID_CERT_SHA256", "APP", "optional", z.string().regex(/^([0-9A-F]{2}(:[0-9A-F]{2}){31})(\s*,\s*[0-9A-F]{2}(:[0-9A-F]{2}){31})*$/, "SHA-256 fingerprints AB:CD:…, comma-separated"), "The SHA-256 signing fingerprints of the Android app (EAS and Play): `/.well-known/assetlinks.json` is served only when they are set (App Links)."),
  v("APP_SEARCH_INDEXING", "APP", "optional", z.enum(["on", "off"]), "`off` on every dev / preview deployment: noindex on every response, robots.txt `Disallow: /` with no sitemap, the development line in the footer. Read at build (landing, legal pages) and at request time (the proxy). Production flips it by configuration.", { default: "on" }),
  v("NEXT_PUBLIC_APP_BASE_PATH", "APP", "optional", z.string().regex(/^\/[a-z0-9-]+$/, "must be a single path segment such as /app"), "The path the app is served under (dev.yasakia.com serves it at `/app`, next to the static site at `/`). Empty: the root.", { build: true }),
  v("NEXT_PUBLIC_APP_ENV", "APP", "optional", z.enum(["local", "dev", "staging", "production"]), "Where the build runs, for the build information.", { build: true, default: "local" }),
  v("APP_ACCOUNT_PURGE_INTERVAL_SECONDS", "APP", "optional", int(1, 3600), "How often accounts past their deletion delay are purged.", { default: "60" }),
  v("APP_ANALYTICS_CONSOLE_DAYS", "APP", "optional", int(7, 366), "The period the console's analytics page shows.", { default: "28" }),
  v("APP_ANALYTICS_INTERVAL_SECONDS", "APP", "optional", int(5, 3600), "How often the analytics outbox is sent to Orazaka.", { default: "30" }),
  v("APP_SWEEP_INTERVAL_SECONDS", "APP", "optional", int(5, 86400), "How often expired codes, sessions and uploads are swept.", { default: "600" }),
  v("APP_PHOTO_FACE_COMPARISON", "APP", "optional", z.enum(["on", "off"]), "Whether Orazaka may compare a person's photos with each other to catch a photo of someone else (biometric processing, Québec Law 25: `off` until reviewed; `on` still needs the person's own consent). Counting faces does not depend on it.", { default: "off" }),
  v("APP_MEDIA_REVIEW_INTERVAL_SECONDS", "APP", "optional", int(5, 600), "How often an instance picks up the media messages whose safety check is waiting (or could not decide).", { default: "30" }),
  v("APP_PHOTO_CHECK_INTERVAL_SECONDS", "APP", "optional", int(5, 600), "How often an instance picks up the photo checks asked and not yet worked.", { default: "15" }),
  v("APP_EXPORT_SYNC_BUDGET_MS", "APP", "optional", int(0, 30000), "A data export answers at once when it builds within this budget, else 202 and a background build.", { default: "1000" }),
  v("DATABASE_URL", "DATABASE", "required", text, "PostgreSQL 16 with pgvector."),
  v("DATABASE_DIRECT_URL", "DATABASE", "optional", text, "A direct (session) connection for LISTEN and the migrations when DATABASE_URL goes through a transaction pooler."),
  v("DATABASE_CA_CERT", "DATABASE", "recommended", text, "CA of a managed PostgreSQL (PEM; App Platform: `${<db>.CA_CERT}`), verified with TLS."),
  v("DATABASE_MAX_CONNECTIONS", "DATABASE", "optional", int(1, 50), "Connections one process's pool may hold — see *Database connections*.", { default: "5 (3 in development, 10 behind a pooler)" }),
  v("DATABASE_ENCRYPTION_KEY", "DATABASE", "required", z.string().min(32, "must be 32 random bytes in base64 (or 32+ characters)"), "Encrypts the sensitive fields at rest (AES-256-GCM): 32 random bytes in base64. Keep it.", { secret: true }),
  v("DATABASE_ENCRYPTION_KEYS_PREVIOUS", "DATABASE", "optional", text, "Rotation: previous keys, comma separated — what they sealed still opens.", { secret: true }),
  v("DATABASE_ALLOW_RESET", "DATABASE", "optional", z.enum(["true", "false"]), "Development deployments only: the release job may rebuild a database whose migration history was squashed."),
  v("AUTH_SIGNUP_ENABLED", "AUTH", "recommended", z.enum(["true", "false"]), "May a stranger create an account? **false unless `true`**, decided by the server: the e-mail-code flow then signs existing accounts in and creates none.", { default: "false" }),
  v("AUTH_ALLOWED_IPS", "AUTH", "recommended", text, "Addresses that may open the administration console (comma separated; empty: any outside production, **none** in production). Elsewhere the console is a 404."),
  v("AUTH_SESSION_SECRET", "AUTH", "required", z.string().min(32, "must be at least 32 characters"), "Signs the session tokens and, derived, the upload and local media URLs (32+ random characters).", { secret: true }),
  v("MEDIA_STORAGE_PROVIDER", "MEDIA", "required", z.enum(["local", "bunny", "none"]), "Where photos live: `local` (development, `.storage/`) or `bunny` (production: required). `none` only on a dev deployment (`NEXT_PUBLIC_APP_ENV=dev`): photos answer 503.", { default: "local" }),
  v("MEDIA_STORAGE_LOCAL_DIR", "MEDIA", "optional", text, "The folder of `local` storage.", { default: ".storage/" }),
  v("MEDIA_STORAGE_ZONE", "MEDIA", "required", text, "Storage zone name (`bunny`)."),
  v("MEDIA_STORAGE_API_KEY", "MEDIA", "required", text, "Storage zone password (`bunny`).", { secret: true }),
  v("MEDIA_STORAGE_ENDPOINT", "MEDIA", "optional", text, "The zone's region host.", { default: "storage.bunnycdn.com" }),
  v("MEDIA_CDN_HOSTNAME", "MEDIA", "required", text, "Pull zone serving the photos (Optimizer and token authentication on)."),
  v("MEDIA_CDN_TOKEN_AUTH_KEY", "MEDIA", "required", text, "Signs the photo URLs (the pull zone's token authentication key).", { secret: true }),
  v("MEDIA_FFMPEG_PATH", "MEDIA", "optional", text, "The ffmpeg binary that cleans and measures videos and voice messages (the container image copies one to a fixed path). Unset: the one the `ffmpeg-static` package downloaded."),
  v("MEDIA_PHOTO_MODERATION", "MEDIA", "optional", z.enum(["auto"]), "Photo moderation: `auto` (V1 — approved at once; a report reopens the review).", { default: "auto" }),
  v("MAIL_PROVIDER", "MAIL", "required", z.enum(["mailgun", "none"]), "The e-mail service: `mailgun`. Production is fail-closed without it (a sign-in code is never logged there). `none` only on a dev deployment (`NEXT_PUBLIC_APP_ENV=dev`): the code flow answers 503."),
  v("MAIL_API_KEY", "MAIL", "required", text, "The provider's API key.", { secret: true }),
  v("MAIL_DOMAIN", "MAIL", "required", text, "Sending domain (e.g. `mg.yasakia.com`)."),
  v("MAIL_API_URL", "MAIL", "optional", url, "API base (EU region: `https://api.eu.mailgun.net`).", { default: "https://api.mailgun.net" }),
  v("MAIL_FROM", "MAIL", "optional", text, "Sender address.", { default: "Yasakia <no-reply@mg.yasakia.com>" }),
  v("MAIL_DELIVERY", "MAIL", "optional", z.enum(["log", "on", "file"]), "Outside production: `on` sends, `file` writes to MAIL_OUTBOX_DIR (the e2e scenarios read the codes there), `log` logs.", { default: "log" }),
  v("MAIL_OUTBOX_DIR", "MAIL", "optional", text, "Folder of `file` delivery.", { default: ".mail-outbox/" }),
  v("MAIL_TEMPLATES_DIR", "MAIL", "optional", text, "Another folder of templates.", { default: "apps/web/mail-templates" }),
  v("PUSH_DELIVERY", "PUSH", "optional", onOff, "Pushes (Expo Push Service) leave only in production, or here with `on`."),
  v("PUSH_ACCESS_TOKEN", "PUSH", "optional", text, "Expo access token — with enhanced push security only.", { secret: true }),
  v("REALTIME_BUS", "REALTIME", "optional", z.enum(["memory", "postgres", "redis"]), "`postgres` (LISTEN/NOTIFY, no broker), `redis` (several instances), `memory` (tests).", { default: "postgres" }),
  v("REALTIME_REDIS_URL", "REALTIME", "optional", url, "Redis / Valkey — required with `REALTIME_BUS=redis`.", { secret: true }),
  v("REALTIME_PREFIX", "REALTIME", "optional", text, "Channel prefix on the bus.", { default: "yasakia:rt:" }),
  v("REALTIME_STREAM_MAX_SECONDS", "REALTIME", "optional", int(0, 3600), "A stream ends after this long and the client resumes.", { default: "300" }),
  v("ABUSE_RATE_LIMIT_STORE", "ABUSE", "recommended", z.enum(["memory", "postgres"]), "`memory` (one instance) or `postgres` (shared — required before a second instance).", { default: "memory" }),
  v("ABUSE_CLIENT_IP_HEADER", "ABUSE", "recommended", text, "The header the edge sets with the client's address (App Platform: `do-connecting-ip`)."),
  v("ABUSE_TRUSTED_PROXY_HOPS", "ABUSE", "optional", int(0, 10), "Else: the entry this far from the right of `X-Forwarded-For`.", { default: "1" }),
  v("AI_ENGINE_URL", "AI", "optional", url, "Base URL of the Orazaka engine's edge (its `/edge` path). Yasakia reaches a model through Orazaka only. Unset: the agent and the batches answer 503 — never a demo, never a stand-in."),
  v("AI_ENGINE_API_KEY", "AI", "optional", text, "Yasakia's service key at Orazaka (`oz_…`, the account `svc_yasakia`). A SECRET set with `doctl apps update`; never printed.", { secret: true }),
  v("AI_PSEUDONYM_KEY", "AI", "optional", z.string().min(32, "must be at least 32 characters"), "The key of the pseudonyms Yasakia sends to Orazaka's analytics (`HMAC-SHA256`, 32+ characters). Unset: nothing is sent. Rotating it forgets every history at Orazaka.", { secret: true }),
  v("AI_CHAT_TIMEOUT_SECONDS", "AI", "optional", int(5, 120), "How long one conversational call to Orazaka may take before the agent gives up.", { default: "45" }),
  v("AI_EMBED_TIMEOUT_SECONDS", "AI", "optional", int(2, 60), "How long one embedding call may take.", { default: "15" }),
  v("AI_PHOTO_CHECK_TIMEOUT_SECONDS", "AI", "optional", int(30, 600), "How long Orazaka's photo check (up to six photos: faces, then a vision model) may take before the check is given up and can be asked again.", { default: "180" }),
  v("OPERATOR_API_TOKEN", "OPERATOR", "recommended", z.string().min(32, "must be at least 32 characters"), "The operators' service token for `/api/admin/*` (32+ characters). Unset: no admin route answers.", { secret: true }),
  v("OPERATOR_ALLOWED_IPS", "OPERATOR", "recommended", text, "Addresses allowed to call the admin API (comma separated; empty: any outside production, none in production)."),
];

/** Every value set must match its schema — names only in the problems, never a value. */
export function schemaProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  for (const e of ENV_VARS) {
    const raw = env[e.name]?.trim();
    if (!raw) continue;
    const parsed = e.schema.safeParse(raw);
    if (!parsed.success) problems.push(`${e.name} ${parsed.error.issues[0]?.message ?? "is invalid"}`);
  }
  return problems;
}
