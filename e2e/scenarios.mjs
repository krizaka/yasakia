#!/usr/bin/env node
/**
 * End-to-end feature scenarios against a running Yasakia API on a freshly seeded PostgreSQL — every endpoint of the
 * foundations, with real sessions: sign-up by e-mail code (18+ checked by the server), sign-in, bearer tokens and their
 * revocation, the profile, the rounded position, photos from the signed upload to the signed view (and who may see
 * them), blocks, reports (encrypted, read by operators behind a token and an allow-list), push tokens, the event stream
 * over LISTEN/NOTIFY, the export, suspension, deletion and the purge of the media — and, over every answer, the rule
 * that no raw media URL or storage key ever leaves the API.
 *
 *   npm run test:e2e                      # builds its own database and server (e2e/run.mjs)
 *   APP_URL=http://localhost:3000 node e2e/scenarios.mjs   # against a server started with the e2e settings
 *
 * Settings the server must share (e2e/run.mjs E2E_ENV): MAIL_DELIVERY=file + MAIL_OUTBOX_DIR, OPERATOR_API_TOKEN,
 * OPERATOR_ALLOWED_IPS=203.0.113.7, MEDIA_STORAGE_PROVIDER=local + MEDIA_STORAGE_LOCAL_DIR, APP_ACCOUNT_PURGE_INTERVAL_SECONDS=1.
 * Time is moved and relationships (a batch, an intro) are set in SQL — the endpoints that create them come with PY3.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { execFileSync } from "node:child_process";
import os from "node:os";

import ffmpegPath from "ffmpeg-static";
import pg from "pg";
import sharp from "sharp";

import { readEnv, ROOT } from "../scripts/lib.mjs";
import { vectorOf } from "./orazaka-stub.mjs";

const fileEnv = readEnv();
const env = (name, fallback) => process.env[name] || fileEnv[name] || fallback;
const B = env("APP_URL", "http://localhost:3000").replace(/\/$/, "");
const OUTBOX = path.resolve(env("MAIL_OUTBOX_DIR", path.join(ROOT, ".mail-outbox")));
const STORAGE = path.resolve(env("MEDIA_STORAGE_LOCAL_DIR", path.join(ROOT, ".storage")));
const ADMIN_TOKEN = env("OPERATOR_API_TOKEN", "e2e-only-operator-token-0123456789abcdef0123");
const ADMIN_IP = (env("OPERATOR_ALLOWED_IPS", "203.0.113.7") || "203.0.113.7").split(",")[0].trim();
const db = new pg.Client({ connectionString: env("DATABASE_URL", "postgresql://yasakia_user:yasakia_secret@localhost:5435/yasakia_db?sslmode=disable") });
await db.connect();
const sql = async (text, values = []) => (await db.query(text, values)).rows;

let failures = 0;
let checks = 0;
const check = (name, cond, extra = "") => {
  checks++;
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${typeof extra === "string" ? extra : JSON.stringify(extra)}`}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);
let ipCounter = 10;
const freshIp = () => `198.51.100.${ipCounter++}`;

// Every JSON answer is kept: the last scenario scans them all for a raw media URL or storage key.
const answers = [];
async function call(pathname, { method = "GET", token, body, ip, headers = {} } = {}) {
  const res = await fetch(B + pathname, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(ip ? { "X-Forwarded-For": ip } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
    answers.push({ path: pathname, json });
  } catch {}
  return { status: res.status, json, headers: res.headers };
}

/** The last code e-mailed to an address (MAIL_DELIVERY=file). */
async function codeFor(email) {
  for (let i = 0; i < 40; i++) {
    const files = fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX).filter((f) => f.endsWith(".json")).sort() : [];
    for (const file of files.reverse()) {
      const mail = JSON.parse(fs.readFileSync(path.join(OUTBOX, file), "utf8"));
      if (mail.to === email && mail.template === "sign-in-code") return { code: /\b(\d{6})\b/.exec(mail.text)[1], mail };
    }
    await sleep(100);
  }
  throw new Error(`no code e-mailed to ${email}`);
}
const mailsTo = (email, template) =>
  (fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX) : []).map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX, f), "utf8"))).filter((m) => m.to === email && m.template === template);

/** A new adult account, signed in: its token, id, address and the IP it calls from. */
async function signUp(name, { birthDate = "1992-04-18", locale = "en" } = {}) {
  const email = `${name}-${run}@example.test`;
  const ip = freshIp();
  await call("/api/auth/request-code", { method: "POST", body: { email, locale }, ip });
  const { code } = await codeFor(email);
  const r = await call("/api/auth/verify", { method: "POST", body: { email, code, client: "native", birthDate, acceptTerms: true, locale }, ip });
  return { email, ip, token: r.json.token, id: r.json.account?.id, status: r.status };
}

/** A picture as the phone would send it. `exif` adds GPS metadata the API must strip. */
async function picture({ width = 640, height = 800, format = "jpeg", gps = false } = {}) {
  let image = sharp({ create: { width, height, channels: 3, background: { r: 20, g: 184, b: 166 } } }).composite([
    { input: { create: { width: Math.round(width / 2), height: Math.round(height / 2), channels: 3, background: { r: 16, g: 120, b: 90 } } }, left: 10, top: 10 },
  ]);
  if (gps) image = image.withExif({ IFD0: { Make: "E2E Phone", Model: "Yasakia Test" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "45/1 30/1 3180/100", GPSLongitudeRef: "W", GPSLongitude: "73/1 35/1 1200/100" } });
  return format === "png" ? image.png().toBuffer() : image.jpeg({ quality: 90 }).toBuffer();
}

async function uploadPhoto(user, bytes, contentType = "image/jpeg") {
  const start = await call("/api/me/photos", { method: "POST", token: user.token, body: { contentType, bytes: bytes.length }, ip: user.ip });
  if (start.status !== 201) return { start };
  const put = await fetch(start.json.upload.url, { method: "PUT", headers: { "Content-Type": contentType }, body: bytes });
  const complete = await call(`/api/me/photos/${start.json.photo.id}/complete`, { method: "PUT", token: user.token, ip: user.ip });
  return { start, put, complete, id: start.json.photo.id };
}

// ── Health ──────────────────────────────────────────────────────────────────────────────────────
{
  const r = await call("/api/healthz");
  check("the health check answers, database up", r.status === 200 && r.json.database === true, r.json);
}

// ── The app-version contract and the app links (krizaka/.github#75, #81) ─────────────────────────────────────────
{
  const cfg = await call("/api/v1/app-config?platform=ios&version=1.0.0", { headers: { "Accept-Language": "fr" } });
  check("app-config: public, cacheable, permissive by default (no update forced, no maintenance)", cfg.status === 200 && cfg.json.platform === "ios" && cfg.json.updateMode === "none" && cfg.json.maintenance?.on === false && !!cfg.headers.get("etag"), cfg.json);
  await sql("update app_config set min_supported_version = '2.0.0', latest_version = '2.0.0', revision = revision + 1 where platform = 'android'");
  const old = await call("/api/v1/app-config?platform=android&version=1.0.0");
  check("app-config: an app below the minimum is told to update (force), read from the database", old.json.updateMode === "force" || (await sleep(31000), (await call("/api/v1/app-config?platform=android&version=1.0.1")).json.updateMode === "force"));
  await sql("update app_config set min_supported_version = '0.0.0', latest_version = '0.0.0', revision = revision + 1 where platform = 'android'");
  check("app-config: an unknown platform is refused", (await call("/api/v1/app-config?platform=symbian&version=1.0.0")).status >= 400);
  check("app links: not served until the app's identity is configured (404, never a guess)", (await call("/.well-known/apple-app-site-association")).status === 404 && (await call("/.well-known/assetlinks.json")).status === 404);
}

// ── Sign-up and sign-in by e-mail code ──────────────────────────────────────────────────────────
const adaEmail = `ada-${run}@example.test`;
const adaIp = freshIp();
let ada;
{
  const r = await call("/api/auth/request-code", { method: "POST", body: { email: adaEmail.toUpperCase(), locale: "fr" }, ip: adaIp });
  check("a code is sent to a new address (same answer as for an existing one)", r.status === 200 && r.json.sent === true, r.json);
  const { code, mail } = await codeFor(adaEmail);
  check("…by e-mail, in the person's language, the code in the template", /Ton code Yasakia/.test(mail.subject) && mail.html.includes(code), mail.subject);
  check("…and no code is kept in clear in the database", (await sql("select count(*)::int as n from auth_codes where email = $1 and code_hash = $2", [adaEmail, code]))[0].n === 0);
  const wrong = await call("/api/auth/verify", { method: "POST", body: { email: adaEmail, code: code === "000000" ? "111111" : "000000", client: "native" }, ip: adaIp });
  check("a wrong code is refused and counted", wrong.status === 400 && wrong.json.code === "CODE_INVALID" && wrong.json.attemptsLeft === 4, wrong.json);
  const noBirth = await call("/api/auth/verify", { method: "POST", body: { email: adaEmail, code, client: "native" }, ip: adaIp });
  check("a new address needs a date of birth (the code stays valid)", noBirth.status === 409 && noBirth.json.code === "BIRTH_DATE_REQUIRED", noBirth.json);
  const badDate = await call("/api/auth/verify", { method: "POST", body: { email: adaEmail, code, client: "native", birthDate: "1990-02-31", acceptTerms: true }, ip: adaIp });
  check("an impossible date is refused", badDate.status === 400 && badDate.json.code === "BIRTH_DATE_INVALID", badDate.json);
  const noTerms = await call("/api/auth/verify", { method: "POST", body: { email: adaEmail, code, client: "native", birthDate: "1994-03-12" }, ip: adaIp });
  check("…and the terms accepted", noTerms.status === 409 && noTerms.json.code === "TERMS_REQUIRED", noTerms.json);
  const cookieClient = await call("/api/auth/verify", { method: "POST", body: { email: adaEmail, code, client: "web", birthDate: "1994-03-12", acceptTerms: true }, ip: adaIp });
  check("only the native client exists (no cookie session)", cookieClient.status === 400, cookieClient.json);
  const res = await fetch(`${B}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": adaIp },
    body: JSON.stringify({ email: adaEmail, code, client: "native", birthDate: "1994-03-12", acceptTerms: true, locale: "fr" }),
  });
  const body = await res.json();
  answers.push({ path: "/api/auth/verify", json: body });
  check("an adult with the right code gets an account and a token (201), no cookie", res.status === 201 && body.created === true && /^yz1\./.test(body.token) && !res.headers.get("set-cookie"), body);
  ada = { email: adaEmail, ip: adaIp, token: body.token, id: body.account.id };
  const again = await call("/api/auth/verify", { method: "POST", body: { email: adaEmail, code, client: "native" }, ip: adaIp });
  check("a code works once", again.status === 400 && again.json.code === "CODE_INVALID", again.json);
  const [row] = await sql("select a.birth_date::text, a.consent_version, a.locale, s.state from accounts a join agent_sessions s on s.account_id = a.id where a.id = $1", [ada.id]);
  check("…with its profile and its agent session (ONBOARDING), its date of birth and consent recorded", row?.state === "ONBOARDING" && row.birth_date === "1994-03-12" && row.consent_version === "2026-10" && row.locale === "fr", row);

  await call("/api/auth/request-code", { method: "POST", body: { email: adaEmail }, ip: adaIp });
  const { code: second } = await codeFor(adaEmail);
  const signIn = await call("/api/auth/verify", { method: "POST", body: { email: adaEmail, code: second, client: "native" }, ip: adaIp });
  check("an existing account signs in without a date of birth (200, created false)", signIn.status === 200 && signIn.json.created === false && signIn.json.account.id === ada.id, signIn.json);
}
{
  const teen = `teen-${run}@example.test`;
  const ip = freshIp();
  await call("/api/auth/request-code", { method: "POST", body: { email: teen }, ip });
  const { code } = await codeFor(teen);
  const minor = new Date();
  minor.setUTCFullYear(minor.getUTCFullYear() - 17);
  const r = await call("/api/auth/verify", { method: "POST", body: { email: teen, code, client: "native", birthDate: minor.toISOString().slice(0, 10), acceptTerms: true }, ip });
  check("under 18 is refused by the server (403 UNDERAGE)", r.status === 403 && r.json.code === "UNDERAGE", r.json);
  const retry = await call("/api/auth/verify", { method: "POST", body: { email: teen, code, client: "native", birthDate: "1990-01-01", acceptTerms: true }, ip });
  check("…and the code is spent: another date needs another code", retry.status === 400 && retry.json.code === "CODE_INVALID", retry.json);
  check("…no account exists for that address", (await sql("select count(*)::int as n from accounts where email = $1", [teen]))[0].n === 0);
}
{
  const spam = `spam-${run}@example.test`;
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await call("/api/auth/request-code", { method: "POST", body: { email: spam }, ip: freshIp() })).status);
  const last = await call("/api/auth/request-code", { method: "POST", body: { email: spam }, ip: freshIp() });
  check("codes are limited per address (5 an hour), 429 with Retry-After", statuses.slice(0, 5).every((s) => s === 200) && last.status === 429 && last.json.code === "RATE_LIMITED" && Number(last.headers.get("retry-after")) > 0, statuses);
  const invalid = await call("/api/auth/request-code", { method: "POST", body: { email: "not-an-address" }, ip: freshIp() });
  check("an invalid address is refused (400)", invalid.status === 400, invalid.json);
}

// ── Bearer tokens ─────────────────────────────────────────────────────────────────────────────────
{
  check("the token opens the account", (await call("/api/me", { token: ada.token })).status === 200);
  check("no token: 401", (await call("/api/me")).status === 401);
  check("a forged token: 401", (await call("/api/me", { token: `${ada.token.slice(0, -2)}xx` })).status === 401);
  const other = ada.token.split(".");
  const tampered = Buffer.from(JSON.stringify({ sub: "00000000-0000-4000-8000-000000000000", v: 1, exp: 9999999999 })).toString("base64url");
  check("a payload changed under the signature: 401", (await call("/api/me", { token: `${other[0]}.${tampered}.${other[2]}` })).status === 401);
}

// ── Profile ───────────────────────────────────────────────────────────────────────────────────────
{
  const me = await call("/api/me", { token: ada.token });
  check("GET /api/me: e-mail, age — never the date of birth", me.json.account.email === adaEmail && typeof me.json.account.age === "number" && !JSON.stringify(me.json).includes("1994-03-12"), me.json);
  const patch = await call("/api/me", { method: "PATCH", token: ada.token, body: { displayName: "  Ada   Lovelace ", gender: "WOMAN", seekingGenders: ["MAN", "MAN"], ageMin: 28, ageMax: 40, intent: "LONG_TERM", radiusKm: 30 } });
  check("PATCH /api/me updates the profile (name tidied, choices de-duplicated)", patch.status === 200 && patch.json.profile.displayName === "Ada Lovelace" && patch.json.profile.seekingGenders.length === 1 && patch.json.profile.radiusKm === 30, patch.json);
  check("an inverted age range is refused", (await call("/api/me", { method: "PATCH", token: ada.token, body: { ageMin: 40, ageMax: 30 } })).json.code === "AGE_RANGE");
  check("an unknown field is refused (strict)", (await call("/api/me", { method: "PATCH", token: ada.token, body: { birthDate: "2010-01-01" } })).status === 400);
  const paused = await call("/api/me", { method: "PATCH", token: ada.token, body: { paused: true } });
  check("pause: the account is PAUSED and still signed in", paused.json.account?.status === "PAUSED" && (await call("/api/me", { token: ada.token })).status === 200, paused.json);
  check("…and resumes", (await call("/api/me", { method: "PATCH", token: ada.token, body: { paused: false } })).json.account?.status === "ACTIVE");
}

// ── Position, rounded before it is written ─────────────────────────────────────────────────────────
{
  const exact = { lat: 45.508844, lng: -73.587811 };
  const r = await call("/api/me/location", { method: "PUT", token: ada.token, body: exact });
  const kept = r.json.location;
  const rad = (d) => (d * Math.PI) / 180;
  const meters = 2 * 6371008.8 * Math.asin(Math.sqrt(Math.sin(rad(kept.lat - exact.lat) / 2) ** 2 + Math.cos(rad(exact.lat)) * Math.cos(rad(kept.lat)) * Math.sin(rad(kept.lng - exact.lng) / 2) ** 2));
  check("the position is rounded to ~1 km (precision 1000 m, within 710 m of the truth, never the same point)", r.status === 200 && kept.precisionM === 1000 && meters <= 710 && (kept.lat !== exact.lat || kept.lng !== exact.lng), { kept, meters });
  const [row] = await sql("select lat, lng, geo_precision_m from profiles where account_id = $1", [ada.id]);
  check("…and only the rounded point is stored", row.lat === kept.lat && row.lng === kept.lng && row.geo_precision_m === 1000, row);
  const near = await call("/api/me/location", { method: "PUT", token: ada.token, body: { lat: exact.lat + 0.0005, lng: exact.lng + 0.0005 } });
  check("a few dozen metres away rounds to the same cell", near.json.location.lat === kept.lat && near.json.location.lng === kept.lng, near.json);
  check("impossible coordinates are refused", (await call("/api/me/location", { method: "PUT", token: ada.token, body: { lat: 91, lng: 0 } })).status === 400);
  const [{ inside }] = await sql("select earth_box(ll_to_earth($1, $2), 5000) @> ll_to_earth(lat, lng) as inside from profiles where account_id = $3", [exact.lat, exact.lng, ada.id]);
  check("earthdistance answers on the stored point (5 km radius)", inside === true);
}

// ── Photos: signed upload → completion → signed view ───────────────────────────────────────────────
const bea = await signUp("bea");
const cal = await signUp("cal");
check("two more adults sign up", bea.status === 201 && cal.status === 201);
let adaPhoto;
{
  const jpeg = await picture({ gps: true });
  const meta = await sharp(jpeg).metadata();
  check("(the test picture carries EXIF GPS, like a phone's)", Boolean(meta.exif) && meta.exif.includes(Buffer.from("E2E Phone")));
  const start = await call("/api/me/photos", { method: "POST", token: ada.token, body: { contentType: "image/jpeg", bytes: jpeg.length }, ip: ada.ip });
  check("POST /api/me/photos answers a signed upload URL (PUT, 300 s), no storage key", start.status === 201 && /\/api\/uploads\/photos\/[0-9a-f-]{36}\?expires=\d+&signature=/.test(start.json.upload.url) && start.json.photo.status === "UPLOADING", start.json);
  const id = start.json.photo.id;
  const tampered = start.json.upload.url.replace(/signature=([A-Za-z0-9_-])/, (_, ch) => `signature=${ch === "A" ? "B" : "A"}`);
  check("an altered upload signature is refused (403)", (await fetch(tampered, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: jpeg })).status === 403);
  check("bytes of another type than declared are refused (415)", (await fetch(start.json.upload.url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: jpeg })).status === 415);
  const tooBig = Buffer.concat([jpeg, Buffer.alloc(1024)]);
  check("more bytes than declared are refused (413)", (await fetch(start.json.upload.url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: tooBig })).status === 413);
  check("completing before the bytes arrive: 409 UPLOAD_MISSING", (await call(`/api/me/photos/${id}/complete`, { method: "PUT", token: ada.token })).json.code === "UPLOAD_MISSING");
  check("the signed URL takes the bytes", (await fetch(start.json.upload.url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: jpeg })).status === 200);
  check("someone else cannot complete it (404)", (await call(`/api/me/photos/${id}/complete`, { method: "PUT", token: bea.token })).status === 404);
  const done = await call(`/api/me/photos/${id}/complete`, { method: "PUT", token: ada.token });
  check("completion: re-encoded, blurhash and size computed, approved (V1 auto-moderation)", done.status === 200 && done.json.photo.status === "APPROVED" && typeof done.json.photo.blurhash === "string" && done.json.photo.width === 640 && done.json.photo.height === 800, done.json);
  check("completing twice changes nothing", (await call(`/api/me/photos/${id}/complete`, { method: "PUT", token: ada.token })).json.photo?.status === "APPROVED");
  const [row] = await sql("select storage_key, mime_type from profile_photos where id = $1", [id]);
  const stored = fs.readFileSync(path.join(STORAGE, row.storage_key));
  const storedMeta = await sharp(stored).metadata();
  check("the stored file has no metadata left — no GPS, no phone model", row.mime_type === "image/jpeg" && !storedMeta.exif && !stored.includes(Buffer.from("E2E Phone")), storedMeta.exif?.length);
  check("…and the staging bytes are gone", !fs.existsSync(path.join(STORAGE, `uploads/${ada.id}/${id}.jpg`)));
  const list = await call("/api/me/photos", { token: ada.token });
  check("GET /api/me/photos lists it — without any URL", list.json.photos.length === 1 && list.json.photos[0].id === id && !JSON.stringify(list.json).includes("http"), list.json);
  const view = await call(`/api/photos/${id}?w=500`, { token: ada.token });
  check("the owner gets a signed URL, width snapped to 640, valid 300 s", view.status === 200 && view.json.photo.width === 640 && /token=/.test(view.json.photo.url) && Math.abs(new Date(view.json.photo.expiresAt).getTime() - Date.now() - 300_000) < 15_000, view.json);
  const image = await fetch(view.json.photo.url);
  const served = Buffer.from(await image.arrayBuffer());
  check("the signed URL serves the picture at that width", image.status === 200 && image.headers.get("content-type") === "image/jpeg" && (await sharp(served).metadata()).width === 640);
  const forged = view.json.photo.url.replace(/width=\d+/, "width=1280");
  check("asking another width under the same signature is refused (403)", (await fetch(forged)).status === 403);
  check("a stranger gets 404 — the photo does not exist for them", (await call(`/api/photos/${id}`, { token: bea.token })).status === 404);
  check("a visitor gets 401", (await call(`/api/photos/${id}`)).status === 401);
  check("an id that is not one: 404", (await call("/api/photos/not-a-uuid", { token: ada.token })).status === 404);
  adaPhoto = id;

  const png = await picture({ format: "png", width: 300, height: 300 });
  const second = await uploadPhoto(ada, png, "image/png");
  check("a PNG is accepted and stored as JPEG", second.complete?.json.photo?.status === "APPROVED", second.complete?.json);
  const order = await call("/api/me/photos", { method: "PATCH", token: ada.token, body: { order: [second.id, adaPhoto] } });
  check("the order changes (the second photo first)", order.json.photos?.[0]?.id === second.id && order.json.photos?.[1]?.position === 1, order.json);
  check("an order that is not exactly the photos is refused", (await call("/api/me/photos", { method: "PATCH", token: ada.token, body: { order: [second.id] } })).json.code === "ORDER_MISMATCH");
  const fake = Buffer.from("this is not a picture at all, just words");
  const bad = await uploadPhoto(ada, fake, "image/png");
  check("bytes that are not the declared picture: 422 INVALID_IMAGE, nothing kept", bad.complete?.status === 422 && bad.complete.json.code === "INVALID_IMAGE" && (await sql("select count(*)::int as n from profile_photos where id = $1", [bad.id]))[0].n === 0, bad.complete?.json);
  for (let i = 0; i < 4; i++) await call("/api/me/photos", { method: "POST", token: ada.token, body: { contentType: "image/jpeg", bytes: 1000 }, ip: ada.ip });
  const seventh = await call("/api/me/photos", { method: "POST", token: ada.token, body: { contentType: "image/jpeg", bytes: 1000 }, ip: ada.ip });
  check("six photos at most (409 TOO_MANY_PHOTOS)", seventh.status === 409 && seventh.json.code === "TOO_MANY_PHOTOS", seventh.json);
  await sql("delete from profile_photos where account_id = $1 and moderation_status = 'UPLOADING'", [ada.id]);
  const removed = await call(`/api/me/photos/${second.id}`, { method: "DELETE", token: ada.token });
  check("a photo is removed — from storage and from the profile", removed.status === 200 && !fs.existsSync(path.join(STORAGE, `photos/${ada.id}/${second.id}.jpg`)) && (await call(`/api/photos/${second.id}`, { token: ada.token })).status === 404);
  check("someone else's photo cannot be removed (404)", (await call(`/api/me/photos/${adaPhoto}`, { method: "DELETE", token: bea.token })).status === 404);
  check("too large a declaration is refused before any upload", (await call("/api/me/photos", { method: "POST", token: ada.token, body: { contentType: "image/jpeg", bytes: 20 * 1024 * 1024 } })).status === 400);
}

// ── Who may see a photo: a current batch, a live intro — never after a block ───────────────────────
{
  const [batch] = await sql("insert into batches (account_id, expires_at) values ($1, now() + interval '72 hours') returning id", [bea.id]);
  await sql("insert into batch_items (batch_id, candidate_id, rank) values ($1, $2, 1)", [batch.id, ada.id]);
  check("someone with Ada in a current batch sees her photo", (await call(`/api/photos/${adaPhoto}`, { token: bea.token })).status === 200);
  check("…someone with no batch and no intro with her still gets 404", (await call(`/api/photos/${adaPhoto}`, { token: cal.token })).status === 404);
  await sql("update batches set status = 'DONE' where id = $1", [batch.id]);
  check("a batch that is done no longer opens the photo", (await call(`/api/photos/${adaPhoto}`, { token: bea.token })).status === 404);
  await sql("update batches set status = 'DEBRIEF_DUE' where id = $1", [batch.id]);
  check("a batch waiting for its debrief still does", (await call(`/api/photos/${adaPhoto}`, { token: bea.token })).status === 200);
  const [a, b] = [ada.id, cal.id].sort();
  const [intro] = await sql("insert into intros (account_a, account_b, expires_at) values ($1, $2, now() + interval '7 days') returning id", [a, b]);
  check("an open intro opens the photo", (await call(`/api/photos/${adaPhoto}`, { token: cal.token })).status === 200);
  await sql("update profile_photos set moderation_status = 'PENDING' where id = $1", [adaPhoto]);
  check("a photo waiting for moderation is shown to nobody but its owner", (await call(`/api/photos/${adaPhoto}`, { token: cal.token })).status === 404 && (await call(`/api/photos/${adaPhoto}`, { token: ada.token })).status === 200);
  await sql("update profile_photos set moderation_status = 'APPROVED' where id = $1", [adaPhoto]);

  // Blocks
  check("blocking yourself is refused", (await call("/api/blocks", { method: "POST", token: ada.token, body: { accountId: ada.id } })).json.code === "SELF");
  check("blocking an unknown account: 404", (await call("/api/blocks", { method: "POST", token: ada.token, body: { accountId: "00000000-0000-4000-8000-000000000000" } })).status === 404);
  const block = await call("/api/blocks", { method: "POST", token: ada.token, body: { accountId: cal.id } });
  check("Ada blocks Cal (201)", block.status === 201 && block.json.block.accountId === cal.id, block.json);
  check("…blocking twice answers the same block", (await call("/api/blocks", { method: "POST", token: ada.token, body: { accountId: cal.id } })).json.block?.id === block.json.block.id);
  check("…their intro is closed (BLOCKED)", (await sql("select state, closed_reason from intros where id = $1", [intro.id]))[0].closed_reason === "BLOCKED");
  check("…Cal no longer sees Ada's photo", (await call(`/api/photos/${adaPhoto}`, { token: cal.token })).status === 404);
  const beaBlock = await call("/api/blocks", { method: "POST", token: bea.token, body: { accountId: ada.id } });
  check("Bea blocks Ada: Ada leaves Bea's batch, the photo is gone for Bea", beaBlock.status === 201 && (await call(`/api/photos/${adaPhoto}`, { token: bea.token })).status === 404 && (await sql("select withdrawn_at from batch_items where batch_id = $1", [batch.id]))[0].withdrawn_at !== null);
  const blocks = await call("/api/blocks", { token: ada.token });
  check("GET /api/blocks lists Ada's blocks (not the blocks against her)", blocks.json.blocks.length === 1 && blocks.json.blocks[0].accountId === cal.id, blocks.json);
  check("Ada cannot lift Bea's block (404)", (await call(`/api/blocks/${beaBlock.json.block.id}`, { method: "DELETE", token: ada.token })).status === 404);
  check("Ada lifts hers", (await call(`/api/blocks/${block.json.block.id}`, { method: "DELETE", token: ada.token })).status === 200 && (await call("/api/blocks", { token: ada.token })).json.blocks.length === 0);
  check("…what it closed stays closed", (await sql("select state from intros where id = $1", [intro.id]))[0].state === "CLOSED");
}

// ── Reports — persisted first, details encrypted, read by operators behind two locks ───────────────
{
  const details = `Asked me for money ${run}`;
  const r = await call("/api/reports", { method: "POST", token: bea.token, body: { accountId: ada.id, reason: "SCAM", details, photoId: adaPhoto } });
  check("a report is filed (201)", r.status === 201 && typeof r.json.report.id === "string", r.json);
  const [row] = await sql("select details_sealed from reports where id = $1", [r.json.report.id]);
  check("…its details are encrypted at rest (AES-GCM, nothing in clear)", row.details_sealed.startsWith("enc:v1:") && !row.details_sealed.includes("money"), row.details_sealed.slice(0, 20));
  const urgent = await call("/api/reports", { method: "POST", token: cal.token, body: { accountId: ada.id, reason: "UNDERAGE" } });
  check("reasons are a closed list", (await call("/api/reports", { method: "POST", token: cal.token, body: { accountId: ada.id, reason: "BORING" } })).status === 400);
  check("reporting yourself is refused", (await call("/api/reports", { method: "POST", token: ada.token, body: { accountId: ada.id, reason: "OTHER" } })).json.code === "SELF");
  check("a photo that is not the reported person's: 404", (await call("/api/reports", { method: "POST", token: cal.token, body: { accountId: bea.id, reason: "OTHER", photoId: adaPhoto } })).status === 404);
  const [a, b] = [bea.id, cal.id].sort();
  const [intro] = await sql("insert into intros (account_a, account_b, expires_at) values ($1, $2, now() + interval '7 days') returning id", [a, b]);
  const inIntro = await call("/api/reports", { method: "POST", token: bea.token, body: { accountId: cal.id, reason: "HARASSMENT", introId: intro.id } });
  check("a report inside an intro freezes it", inIntro.status === 201 && (await sql("select frozen_at from intros where id = $1", [intro.id]))[0].frozen_at !== null);
  check("admin API without the token: 401", (await call("/api/admin/reports", { ip: ADMIN_IP })).status === 401);
  check("admin API with a wrong token: 401", (await call("/api/admin/reports", { ip: ADMIN_IP, headers: { Authorization: "Bearer not-the-operator-token-at-all-0123456789" } })).status === 401);
  check("admin API from an address not allowed: 403", (await call("/api/admin/reports", { ip: "198.51.100.250", headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } })).status === 403);
  const list = await call("/api/admin/reports?status=OPEN", { ip: ADMIN_IP, headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
  const mine = list.json.reports?.filter((x) => [r.json.report.id, urgent.json.report.id, inIntro.json.report.id].includes(x.id)) ?? [];
  check("operators read the reports, details decrypted", list.status === 200 && mine.find((x) => x.id === r.json.report.id)?.details === details, list.json);
  check("…urgent reasons first", list.json.reports[0].urgent === true && mine.findIndex((x) => x.id === urgent.json.report.id) < mine.findIndex((x) => x.id === r.json.report.id));
  check("a member token does not open the admin API", (await call("/api/admin/reports", { ip: ADMIN_IP, token: ada.token })).status === 401);
}

// ── Push tokens ─────────────────────────────────────────────────────────────────────────────────────
{
  const token = `ExponentPushToken[e2e${run}]`;
  check("a phone registers its push token", (await call("/api/push/tokens", { method: "POST", token: ada.token, body: { token, platform: "ios" } })).status === 200);
  check("…something else is refused", (await call("/api/push/tokens", { method: "POST", token: ada.token, body: { token: "not-a-push-token", platform: "ios" } })).json.code === "INVALID_PUSH_TOKEN");
  check("…the phone moves to the account signed in on it", (await call("/api/push/tokens", { method: "POST", token: bea.token, body: { token, platform: "android" } })).status === 200 && (await sql("select account_id from push_tokens where token = $1", [token]))[0].account_id === bea.id);
  check("…and is forgotten", (await call("/api/push/tokens", { method: "DELETE", token: bea.token, body: { token } })).status === 200 && (await sql("select count(*)::int as n from push_tokens where token = $1", [token]))[0].n === 0);
}

// ── Live events over LISTEN/NOTIFY ─────────────────────────────────────────────────────────────────
{
  check("the event stream needs a session (401)", (await call("/api/events")).status === 401);
  const controller = new AbortController();
  const res = await fetch(`${B}/api/events`, { headers: { Authorization: `Bearer ${ada.token}` }, signal: controller.signal });
  check("GET /api/events is a Server-Sent Events stream", res.status === 200 && res.headers.get("content-type")?.startsWith("text/event-stream"));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = "";
  const readUntil = async (pattern, ms) => {
    const until = Date.now() + ms;
    while (!pattern.test(received) && Date.now() < until) {
      const next = await Promise.race([reader.read(), sleep(until - Date.now()).then(() => ({ timeout: true }))]);
      if (next.timeout || next.done) break;
      received += decoder.decode(next.value);
    }
    return pattern.test(received);
  };
  check("…which opens with `connected`", await readUntil(/event: connected/, 5000), received);
  await sleep(500);
  // Another process (this script) NOTIFYs on Yasakia's channel — exactly what another instance's publish does.
  const notify = (event) => sql("select pg_notify('yasakia_events', $1)", [JSON.stringify({ topic: `account:${ada.id}`, event })]);
  await notify({ type: "not.an.event", id: "x" });
  await notify({ type: "batch.ready", batchId: "11111111-1111-4111-8111-111111111111" });
  check("a typed event published by another instance arrives, named by its type", await readUntil(/event: batch\.ready\ndata: \{[^\n]*11111111/, 8000), received);
  check("…an event that is not one of Yasakia's never reaches the app", !received.includes("not.an.event"));
  await sql("select pg_notify('yasakia_events', $1)", [JSON.stringify({ topic: `account:${bea.id}`, event: { type: "intro.opened", introId: "22222222-2222-4222-8222-222222222222" } })]);
  await sleep(800);
  await readUntil(/22222222/, 500);
  check("…and nobody receives another account's events", !received.includes("22222222"));
  controller.abort();
  const [listen] = await sql("select count(*)::int as n from pg_stat_activity where application_name = 'yasakia-listen' and datname = current_database()");
  const [web] = await sql("select count(*)::int as n from pg_stat_activity where application_name = 'yasakia-web' and datname = current_database()");
  // Two servers share this database (the open one and the sign-up-closed one): the bound is servers x the pool size
  // (the development default, 5 — packages/db/src/client.ts), not one pool (yasakia#125).
  const servers = 2;
  const bound = servers * (Number(env("DATABASE_MAX_CONNECTIONS", "")) || 5);
  check(`one named LISTEN connection, the pools named and within ${servers} servers x the pool size (${bound})`, listen.n === 1 && web.n >= 1 && web.n <= bound, { listen: listen.n, web: web.n });
}

// ── Export ──────────────────────────────────────────────────────────────────────────────────────────
{
  const r = await call("/api/me/export", { token: ada.token });
  const data = r.json.export;
  check("GET /api/me/export: everything of the account, at once", r.status === 200 && r.json.ready === true && data.format === "yasakia-export/1" && data.account.email === adaEmail && data.photos.length === 1 && data.profile.location.precisionM === 1000, r.json);
  check("…the date of birth is in her own export (it is hers)", data.account.birthDate === "1994-03-12");
  check("…but not the reports filed about her, nor anyone else's words", data.reportsFiled.length === 0 && !JSON.stringify(data).includes("Asked me for money"));
  const async = await call("/api/me/export?mode=async", { token: ada.token });
  check("an export can be built in the background (202 + id)", async.status === 202 && async.json.ready === false && typeof async.json.id === "string", async.json);
  let ready;
  for (let i = 0; i < 30 && !ready; i++) {
    const poll = await call(`/api/me/export?id=${async.json.id}`, { token: ada.token });
    if (poll.status === 200) ready = poll.json;
    else await sleep(200);
  }
  check("…then fetched by its id", ready?.export?.account?.email === adaEmail, ready);
  check("…sealed at rest", (await sql("select payload_sealed from account_exports where id = $1", [async.json.id]))[0].payload_sealed.startsWith("enc:v1:"));
  check("…and nobody else can fetch it (404)", (await call(`/api/me/export?id=${async.json.id}`, { token: bea.token })).status === 404);
  const beaExport = await call("/api/me/export", { token: bea.token });
  check("Bea's export holds her report, details decrypted for her", beaExport.json.export.reportsFiled.some((x) => x.details?.includes("Asked me for money")));
}

// ── Sign out everywhere, suspension ────────────────────────────────────────────────────────────────
{
  await call("/api/auth/request-code", { method: "POST", body: { email: cal.email }, ip: cal.ip });
  const { code } = await codeFor(cal.email);
  const second = (await call("/api/auth/verify", { method: "POST", body: { email: cal.email, code, client: "native" }, ip: cal.ip })).json.token;
  check("two phones, two tokens", (await call("/api/me", { token: second })).status === 200 && (await call("/api/me", { token: cal.token })).status === 200);
  check("sign out everywhere", (await call("/api/auth/logout", { method: "POST", token: cal.token, body: { everywhere: true } })).json.everywhere === true);
  check("…every token stops at once", (await call("/api/me", { token: second })).status === 401 && (await call("/api/me", { token: cal.token })).status === 401);

  await sql("update accounts set status = 'SUSPENDED' where id = $1", [bea.id]);
  check("a suspended account is refused on its next request (403)", (await call("/api/me", { token: bea.token })).status === 403);
  await call("/api/auth/request-code", { method: "POST", body: { email: bea.email }, ip: bea.ip });
  const { code: beaCode } = await codeFor(bea.email);
  check("…and cannot sign in", (await call("/api/auth/verify", { method: "POST", body: { email: bea.email, code: beaCode, client: "native" }, ip: bea.ip })).json.code === "SUSPENDED");
  check("…nor pause itself out of it", (await call("/api/me", { method: "PATCH", token: bea.token, body: { paused: false } })).status === 403);
}

// ── Deletion: at once, everything; the media purged right after ─────────────────────────────────────
{
  const photoKey = (await sql("select storage_key from profile_photos where id = $1", [adaPhoto]))[0].storage_key;
  check("(Ada's photo is on disk before the deletion)", fs.existsSync(path.join(STORAGE, photoKey)));
  const r = await call("/api/me", { method: "DELETE", token: ada.token, ip: ada.ip });
  check("DELETE /api/me deletes the account", r.status === 200 && r.json.deleted === true, r.json);
  check("…the token is dead at once (401)", (await call("/api/me", { token: ada.token })).status === 401);
  const leftovers = await sql(
    `select (select count(*) from accounts where id = $1) + (select count(*) from profiles where account_id = $1) + (select count(*) from profile_photos where account_id = $1)
      + (select count(*) from agent_sessions where account_id = $1) + (select count(*) from blocks where blocker_id = $1 or blocked_id = $1)
      + (select count(*) from batch_items where candidate_id = $1) + (select count(*) from intros where account_a = $1 or account_b = $1)
      + (select count(*) from account_exports where account_id = $1) + (select count(*) from photo_checks where account_id = $1) + (select count(*) from biometric_consents where account_id = $1) as n`,
    [ada.id],
  );
  check("…every row of hers is gone (profile, photos, photo checks, consent, agent, blocks, batches, intros, exports)", Number(leftovers[0].n) === 0, leftovers[0]);
  check("…the reports about her stay, without her name", (await sql("select count(*)::int as n from reports where reported_id is null and reason in ('SCAM', 'UNDERAGE')"))[0].n >= 2);
  let purged = false;
  for (let i = 0; i < 40 && !purged; i++) {
    const [row] = await sql("select purged_at, storage_keys from account_deletions where account_id = $1", [ada.id]);
    purged = Boolean(row?.purged_at) && row.storage_keys.length === 0;
    if (!purged) await sleep(250);
  }
  check("…the purge removed her photos from storage (account_deletions keeps no personal data)", purged && !fs.existsSync(path.join(STORAGE, photoKey)));
  let confirmed = [];
  for (let i = 0; i < 20 && confirmed.length === 0; i++) {
    confirmed = mailsTo(adaEmail, "account-deleted");
    if (confirmed.length === 0) await sleep(200);
  }
  check("…and a confirmation e-mail left, in her language", confirmed.length === 1 && /supprimé/.test(confirmed[0].subject), confirmed[0]?.subject);
  await call("/api/auth/request-code", { method: "POST", body: { email: adaEmail }, ip: freshIp() });
  const { code } = await codeFor(adaEmail);
  check("the same address starts from nothing (a new account needs a date of birth)", (await call("/api/auth/verify", { method: "POST", body: { email: adaEmail, code, client: "native" }, ip: freshIp() })).json.code === "BIRTH_DATE_REQUIRED");
}

// ── The web console: sign-up closed, password sign-in, sessions, the administration console ───────────
{
  const CLOSED = env("CLOSED_URL", "");
  const QA_USER = { email: "qa+user@yasakia.com", password: env("QA_USER_PASSWORD", "") };
  const QA_ADMIN = { email: "qa+admin@yasakia.com", password: env("QA_ADMIN_PASSWORD", "") };
  const ORIGIN = B;

  /** A call as the browser makes it: the session cookie, a same-origin Origin on writes. */
  async function web(pathname, { method = "GET", cookie, body, ip, origin = ORIGIN } = {}) {
    const res = await fetch(B + pathname, {
      method,
      redirect: "manual",
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method !== "GET" && origin ? { Origin: origin } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(ip ? { "X-Forwarded-For": ip } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, headers: res.headers, text };
  }
  const cookieOf = (res) => /(yasakia_session=[^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
  const signIn = async (who, ip) => {
    const r = await web("/api/auth/password", { method: "POST", body: who, ip: ip ?? freshIp() });
    return { ...r, cookie: cookieOf(r) };
  };
  const ADMIN_IP_HEADER = ADMIN_IP;

  // Sign-up is closed by the server, whatever a client shows.
  if (CLOSED) {
    const email = `closed-${run}@example.test`;
    const ip = freshIp();
    const asked = await fetch(`${CLOSED}/api/auth/request-code`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip }, body: JSON.stringify({ email, locale: "en" }) });
    check("closed sign-up: asking a code for a stranger still answers the same 200 (nothing revealed)", asked.status === 200);
    await sleep(300);
    check("closed sign-up: ...but no code is e-mailed to a stranger", mailsTo(email, "sign-in-code").length === 0);
    const verify = await fetch(`${CLOSED}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip }, body: JSON.stringify({ email, code: "000000", client: "native", birthDate: "1990-01-01", acceptTerms: true }) });
    check("closed sign-up: verifying a stranger creates no account", verify.status === 400 && (await sql("select 1 from accounts where email = $1", [email])).length === 0);
    // A code issued while open still cannot create an account once closed: issue it on the open server, redeem on the closed one.
    const open = await signUp("opened");
    const email2 = `late-${run}@example.test`;
    const ip2 = freshIp();
    await call("/api/auth/request-code", { method: "POST", body: { email: email2, locale: "en" }, ip: ip2 });
    const { code } = await codeFor(email2);
    const late = await fetch(`${CLOSED}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip2 }, body: JSON.stringify({ email: email2, code, client: "native", birthDate: "1990-01-01", acceptTerms: true }) });
    const lateJson = await late.json();
    check("closed sign-up: a valid code cannot create an account (SIGNUP_CLOSED, 403)", late.status === 403 && lateJson.code === "SIGNUP_CLOSED" && (await sql("select 1 from accounts where email = $1", [email2])).length === 0, lateJson);
    check("closed sign-up: the open server still signs people up", open.status < 300 && !!open.token);
  } else {
    check("closed sign-up: CLOSED_URL not set (scenario skipped by the caller)", true);
  }

  // Password sign-in.
  const wrong = await signIn({ email: QA_USER.email, password: "not-the-password-0000" });
  check("password sign-in: a wrong password is a 401 INVALID_CREDENTIALS and sets no cookie", wrong.status === 401 && wrong.json.code === "INVALID_CREDENTIALS" && !wrong.cookie);
  const unknown = await signIn({ email: `nobody-${run}@example.test`, password: "not-the-password-0000" });
  check("password sign-in: an unknown address gets the very same answer", unknown.status === 401 && unknown.json.code === "INVALID_CREDENTIALS" && unknown.json.error === wrong.json.error);
  const user = await signIn(QA_USER);
  check("password sign-in: the right password sets an HttpOnly, SameSite=Lax session cookie", user.status === 200 && !!user.cookie && /HttpOnly/i.test(user.headers.get("set-cookie")) && /SameSite=Lax/i.test(user.headers.get("set-cookie")), user.json);
  check("the session cookie is opaque: its hash, not itself, is stored", user.cookie && (await sql("select 1 from web_sessions where token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')", [user.cookie.split("=")[1]])).length === 1);
  check("a cookie session reads /api/me", (await web("/api/me", { cookie: user.cookie })).json.account?.email === QA_USER.email);
  // The app signs in with the same password and gets a bearer token, never a cookie (krizaka/.github#76, e-mail sign-in).
  {
    const native = await call("/api/auth/password", { method: "POST", body: { ...QA_USER, client: "native" }, ip: freshIp() });
    check("native password sign-in: a bearer token, no cookie, and it reads /api/me", native.status === 200 && typeof native.json.token === "string" && !native.headers.get("set-cookie") && (await call("/api/me", { token: native.json.token })).json.account?.email === QA_USER.email);
    check("native password sign-in: a wrong password is the same 401", (await call("/api/auth/password", { method: "POST", body: { email: QA_USER.email, password: "not-the-password-0000", client: "native" }, ip: freshIp() })).status === 401);
  }
  check("no cookie: /api/me/dashboard is a 401", (await web("/api/me/dashboard")).status === 401);
  const dash = await web("/api/me/dashboard", { cookie: user.cookie });
  check("the dashboard answers counts and dates (agent state, profile completeness, no person, no score)", dash.status === 200 && dash.json.dashboard?.agentState === "ONBOARDING" && dash.json.dashboard?.profile?.total === 5 && dash.json.dashboard?.batch === null);
  check("a write with another origin is refused (CROSS_ORIGIN) even with the cookie", (await web("/api/me", { method: "PATCH", cookie: user.cookie, body: { displayName: "Eve" }, origin: "https://evil.example" })).json.code === "CROSS_ORIGIN");

  // Brute force is limited.
  {
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await web("/api/auth/password", { method: "POST", body: { email: `brute-${run}@example.test`, password: "guess-guess-guess" }, ip })).status);
    check("password sign-in is rate limited per address (429 after 10 tries)", statuses.slice(0, 10).every((x) => x === 401) && statuses.slice(10).every((x) => x === 429), statuses.join(","));
  }

  // Sessions and devices.
  const second = await signIn(QA_USER);
  const list = await web("/api/me/sessions", { cookie: user.cookie });
  check("sessions: both devices are listed, the current one marked", list.json.sessions?.length >= 2 && list.json.sessions.filter((x) => x.current).length === 1);
  const other = list.json.sessions.find((x) => !x.current);
  const ended = await web(`/api/me/sessions/${other.id}`, { method: "DELETE", cookie: user.cookie });
  check("sessions: ending another session works", ended.status === 200 && ended.json.signedOut === false);
  const pooled = await signIn(QA_USER);
  const sweep = await web("/api/me/sessions", { method: "DELETE", cookie: user.cookie });
  check("sessions: ending every other device keeps this one", sweep.status === 200 && (await web("/api/me", { cookie: user.cookie })).status === 200 && (await web("/api/me", { cookie: pooled.cookie })).status === 401);
  check("sessions: a session ended elsewhere is a 401 at once", (await web("/api/me", { cookie: second.cookie })).status === 401);
  check("sessions: another account's session id is a 404", (await web(`/api/me/sessions/${other.id}`, { method: "DELETE", cookie: user.cookie })).status === 404);

  // The profile through the cookie, and the password.
  const patched = await web("/api/me", { method: "PATCH", cookie: user.cookie, body: { displayName: "QA user (test)", locale: "en" } });
  check("account: the profile is saved through the same API as the app", patched.status === 200 && patched.json.profile?.displayName === "QA user (test)");
  const tooShort = await web("/api/me/password", { method: "POST", cookie: user.cookie, body: { current: QA_USER.password, next: "short" } });
  check("account: a weak new password is refused (PASSWORD_TOO_SHORT)", tooShort.status === 400 && tooShort.json.code === "PASSWORD_TOO_SHORT");
  const badCurrent = await web("/api/me/password", { method: "POST", cookie: user.cookie, body: { current: "wrong-current-pass", next: "a-new-long-passphrase-1" } });
  check("account: the current password must be right (WRONG_PASSWORD)", badCurrent.status === 403 && badCurrent.json.code === "WRONG_PASSWORD");
  const stay = await signIn(QA_USER);
  const changed = await web("/api/me/password", { method: "POST", cookie: user.cookie, body: { current: QA_USER.password, next: `${QA_USER.password}-changed` } });
  check("account: changing the password ends the other sessions", changed.status === 200 && (await web("/api/me", { cookie: stay.cookie })).status === 401 && (await web("/api/me", { cookie: user.cookie })).status === 200);
  check("account: the new password signs in, the old one no longer does", (await signIn({ email: QA_USER.email, password: `${QA_USER.password}-changed` })).status === 200 && (await signIn(QA_USER)).status === 401);
  await web("/api/me/password", { method: "POST", cookie: user.cookie, body: { current: `${QA_USER.password}-changed`, next: QA_USER.password } });

  // The administration console: role AND address.
  const adminIn = await signIn(QA_ADMIN, ADMIN_IP_HEADER);
  check("admin: the administrator signs in", adminIn.status === 200 && adminIn.json.account?.role === "ADMIN");
  check("admin: a person is refused the users list (403)", (await web("/api/admin/users", { cookie: user.cookie, ip: ADMIN_IP_HEADER })).status === 403);
  check("admin: an administrator on a wrong address is refused (IP_NOT_ALLOWED)", (await web("/api/admin/users", { cookie: adminIn.cookie, ip: "198.51.100.200" })).json.code === "IP_NOT_ALLOWED");
  check("admin: no session, no users list (401)", (await web("/api/admin/users", { ip: ADMIN_IP_HEADER })).status === 401);
  const users = await web("/api/admin/users?size=2&sort=email&dir=asc", { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER });
  check("admin: the users list is paged and sorted on the server", users.status === 200 && users.json.rows.length === 2 && users.json.total > 2 && users.json.rows[0].email <= users.json.rows[1].email);
  check("admin: a row carries no date of birth", users.json.rows.every((r) => !("birthDate" in r) && !("birth_date" in r)));
  const found = await web(`/api/admin/users?search=${encodeURIComponent("qa+user")}&status=ACTIVE&role=USER`, { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER });
  check("admin: search and filters (status, role) are answered by the server", found.json.rows?.length === 1 && found.json.rows[0].email === QA_USER.email);
  const someone = await signUp("target");
  const detail = await web(`/api/admin/users/${someone.id}`, { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER });
  check("admin: one account's detail (counts, no secret)", detail.status === 200 && detail.json.user?.counts && !JSON.stringify(detail.json).includes("birth"));
  check("admin: a malformed id is a 404", (await web("/api/admin/users/not-a-uuid", { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER })).status === 404);
  const sus = await web(`/api/admin/users/${someone.id}/suspend`, { method: "POST", cookie: adminIn.cookie, ip: ADMIN_IP_HEADER, body: { reason: "e2e: testing the suspension" } });
  check("admin: suspend works", sus.status === 200);
  check("admin: the suspended person's app token stops working at once", [401, 403].includes((await call("/api/me", { token: someone.token })).status));
  check("admin: suspending twice is refused (ALREADY_SUSPENDED)", (await web(`/api/admin/users/${someone.id}/suspend`, { method: "POST", cookie: adminIn.cookie, ip: ADMIN_IP_HEADER, body: { reason: "again please" } })).json.code === "ALREADY_SUSPENDED");
  check("admin: an administrator cannot be suspended from the console", (await web(`/api/admin/users/${adminIn.json.account.id}/suspend`, { method: "POST", cookie: adminIn.cookie, ip: ADMIN_IP_HEADER, body: { reason: "myself" } })).json.code === "SELF");
  const res = await web(`/api/admin/users/${someone.id}/restore`, { method: "POST", cookie: adminIn.cookie, ip: ADMIN_IP_HEADER });
  check("admin: restore works (the account is ACTIVE; its old tokens stay dead — it signs in again)", res.status === 200 && (await sql("select status from accounts where id = $1", [someone.id]))[0].status === "ACTIVE");
  check("admin: restoring an active account is refused (NOT_SUSPENDED)", (await web(`/api/admin/users/${someone.id}/restore`, { method: "POST", cookie: adminIn.cookie, ip: ADMIN_IP_HEADER })).json.code === "NOT_SUSPENDED");
  const audit = await web(`/api/admin/audit?size=50&action=admin.suspend,admin.restore&search=${encodeURIComponent("qa+admin")}`, { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER });
  check("audit: the suspension and the restoration are logged with who did it and why", audit.json.rows?.some((r) => r.action === "admin.suspend" && r.targetId === someone.id && r.detail?.reason?.includes("e2e")) && audit.json.rows.some((r) => r.action === "admin.restore" && r.targetId === someone.id), audit.json);
  // Account actions: end the sessions, change the role, erase (Law 25).
  {
    const asAdmin = (path, init = {}) => web(path, { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER, ...init });
    const target = await signUp("erasable");
    check("admin: ending the sessions of an account works and the app token dies at once", (await asAdmin(`/api/admin/users/${target.id}/sessions`, { method: "POST" })).status === 200 && [401, 403].includes((await call("/api/me", { token: target.token })).status));
    check("admin: you cannot end your own sessions (SELF)", (await asAdmin(`/api/admin/users/${adminIn.json.account.id}/sessions`, { method: "POST" })).json.code === "SELF");
    check("admin: a role outside the list is refused", (await asAdmin(`/api/admin/users/${target.id}/role`, { method: "POST", body: { role: "OWNER" } })).status === 400);
    check("admin: you cannot change your own role (SELF)", (await asAdmin(`/api/admin/users/${adminIn.json.account.id}/role`, { method: "POST", body: { role: "USER" } })).json.code === "SELF");
    check("admin: the administrator role is granted and withdrawn", (await asAdmin(`/api/admin/users/${target.id}/role`, { method: "POST", body: { role: "ADMIN" } })).status === 200 && (await sql("select role from accounts where id = $1", [target.id]))[0].role === "ADMIN" && (await asAdmin(`/api/admin/users/${target.id}/role`, { method: "POST", body: { role: "USER" } })).status === 200 && (await sql("select role from accounts where id = $1", [target.id]))[0].role === "USER");
    check("admin: erasing with the wrong e-mail is refused (CONFIRM_MISMATCH)", (await asAdmin(`/api/admin/users/${target.id}`, { method: "DELETE", body: { confirmEmail: "someone@else.test" } })).json.code === "CONFIRM_MISMATCH");
    check("admin: you cannot erase your own account (SELF)", (await asAdmin(`/api/admin/users/${adminIn.json.account.id}`, { method: "DELETE", body: { confirmEmail: QA_ADMIN.email } })).json.code === "SELF");
    const email = (await sql("select email from accounts where id = $1", [target.id]))[0].email;
    check("admin: erasing with the e-mail typed deletes the account and what it owns", (await asAdmin(`/api/admin/users/${target.id}`, { method: "DELETE", body: { confirmEmail: email } })).status === 200 && (await sql("select 1 from accounts where id = $1", [target.id])).length === 0);
    const acted = await asAdmin(`/api/admin/audit?size=50&action=admin.sessions_revoked,admin.role,admin.delete&search=${encodeURIComponent("qa+admin")}`);
    check("audit: the three actions are logged with who did them", ["admin.sessions_revoked", "admin.role", "admin.delete"].every((a) => acted.json.rows?.some((r) => r.action === a && r.targetId === target.id)), acted.json.rows?.map((r) => r.action).join(","));
  }
  const refusedLog = await web("/api/admin/audit?action=auth.sign_in_refused&size=5", { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER });
  check("audit: refused sign-ins are logged too", refusedLog.json.rows?.length > 0);
  check("audit: the operator token reads the same API (no account)", (await call("/api/admin/users?size=1", { token: ADMIN_TOKEN, ip: ADMIN_IP })).status === 200);

  // Moderation, introductions, overview and health.
  {
    const asAdmin = (path, init = {}) => web(path, { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER, ...init });
    check("moderation: a person is refused the queue (403)", (await web("/api/admin/report-queue", { cookie: user.cookie, ip: ADMIN_IP_HEADER })).status === 403);
    const queue = await asAdmin("/api/admin/report-queue?status=OPEN&size=50");
    check("moderation: the queue lists open reports, urgent reasons first", queue.status === 200 && queue.json.rows.length > 0 && ["UNDERAGE", "THREAT"].includes(queue.json.rows[0].reason) && queue.json.rows[0].urgent === true, queue.json.rows?.map((r) => r.reason));
    check("moderation: the list carries no free text, the details open one at a time", queue.json.rows.every((r) => !("details" in r) && !("detailsSealed" in r)));
    const scam = queue.json.rows.find((r) => r.reason === "SCAM");
    const opened = await asAdmin(`/api/admin/report-queue/${scam.id}`);
    check("moderation: one report's words open for an administrator", opened.status === 200 && typeof opened.json.details === "string" && opened.json.details.length > 0);
    check("moderation: a status outside the list is refused", (await asAdmin(`/api/admin/report-queue/${scam.id}`, { method: "PATCH", body: { status: "BANNED" } })).status === 400);
    const moved = await asAdmin(`/api/admin/report-queue/${scam.id}`, { method: "PATCH", body: { status: "ACTIONED" } });
    check("moderation: a report is moved to ACTIONED", moved.status === 200 && (await sql("select status, reviewed_at from reports where id = $1", [scam.id]))[0].status === "ACTIONED");
    check("moderation: ...and the decision is in the audit log", (await asAdmin("/api/admin/audit?action=admin.report&size=10")).json.rows?.some((r) => r.detail?.status === "ACTIONED"));
    check("moderation: a malformed id is a 404", (await asAdmin("/api/admin/report-queue/not-a-uuid")).status === 404);
    const intro = await asAdmin("/api/admin/intros?state=OPEN&size=5");
    check("introductions: the overview is paged, filtered by state, with message counts and no person", intro.status === 200 && intro.json.total >= 1 && intro.json.rows.every((r) => typeof r.messages === "number" && !("accountA" in r) && !("account_a" in r) && !("body" in r)), intro.json);
    const ov = await asAdmin("/api/admin/overview");
    check("overview: counts of accounts, reports, introductions and batches", ov.status === 200 && typeof ov.json.reports.open === "number" && typeof ov.json.intros.OPEN === "number" && ov.json.accounts.active > 0);
    const hl = await asAdmin("/api/admin/health");
    check("health: the pool and the connections are shown against their budget, with the queues", hl.json.connections?.pool?.max >= 1 && hl.json.connections.limit > 0 && typeof hl.json.queues?.openReports === "number");
    check("health: the database answers and the version is told", hl.status === 200 && hl.json.database === true && typeof hl.json.version === "string" && hl.json.signupOpen === true);
    check("health, overview, intros: refused to a person (403)", (await web("/api/admin/health", { cookie: user.cookie, ip: ADMIN_IP_HEADER })).status === 403 && (await web("/api/admin/overview", { cookie: user.cookie, ip: ADMIN_IP_HEADER })).status === 403);
    for (const p of ["/app/en/admin", "/app/en/admin/reports", "/app/fr/admin/intros", "/app/en/admin/health"]) {
      check(`pages: ${p} renders for an administrator and is a 404 for a person`, (await web(p, { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER })).status === 200 && (await web(p, { cookie: user.cookie, ip: ADMIN_IP_HEADER })).status === 404);
    }
  }

  // The rule sets: read, publish a new version with a reason (bounded, audited), restore an old one — append-only.
  {
    const asAdmin = (path, init = {}) => web(path, { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER, ...init });
    check("rules: refused to a person (403)", (await web("/api/admin/rule-sets", { cookie: user.cookie, ip: ADMIN_IP_HEADER })).status === 403 && (await web("/api/admin/rule-sets/MATCHING", { method: "POST", cookie: user.cookie, ip: ADMIN_IP_HEADER, body: { params: {}, reason: "nope" } })).status === 403);
    const before = await asAdmin("/api/admin/rule-sets");
    const active = before.json.ruleSets?.MATCHING?.find((v) => v.active);
    check("rules: both domains the app reads are listed, one active version each", before.status === 200 && !!active && before.json.ruleSets.AGENT?.filter((v) => v.active).length === 1, before.json);
    check("rules: a value outside its bounds is refused (422)", (await asAdmin("/api/admin/rule-sets/MATCHING", { method: "POST", body: { params: { ...active.params, minAffinity: 2 }, reason: "out of bounds" } })).json.code === "RULES_OUT_OF_BOUNDS");
    check("rules: a key the code does not read is refused (422)", (await asAdmin("/api/admin/rule-sets/MATCHING", { method: "POST", body: { params: { ...active.params, accentColor: "#10b981" }, reason: "a colour is not a rule" } })).json.code === "RULES_OUT_OF_BOUNDS");
    check("rules: a domain the app does not read does not exist (404)", (await asAdmin("/api/admin/rule-sets/CUSTOMIZATION", { method: "POST", body: { params: {}, reason: "nothing" } })).status === 404);
    check("rules: the active version again is refused (RULES_UNCHANGED)", (await asAdmin("/api/admin/rule-sets/MATCHING", { method: "POST", body: { params: active.params, reason: "same again" } })).json.code === "RULES_UNCHANGED");
    const published = await asAdmin("/api/admin/rule-sets/MATCHING", { method: "POST", body: { params: { ...active.params, batchHours: active.params.batchHours + 1 }, reason: "e2e: one more hour" } });
    const live = await sql("select version, params from rule_sets where domain = 'MATCHING' and active");
    check("rules: a new version is published and active at once; it names what changed", published.status === 200 && published.json.version === active.version + 1 && published.json.changed.join() === "batchHours" && live.length === 1 && live[0].version === published.json.version, published.json);
    const restored = await asAdmin("/api/admin/rule-sets/MATCHING/restore", { method: "POST", body: { version: active.version, reason: "e2e: back to where we were" } });
    const back = await sql("select version, params from rule_sets where domain = 'MATCHING' and active");
    check("rules: restoring publishes the old values as a new version (nothing erased)", restored.status === 200 && back[0].version === active.version + 2 && JSON.stringify(back[0].params) === JSON.stringify(active.params) && (await sql("select count(*)::int as n from rule_sets where domain = 'MATCHING'"))[0].n >= 3);
    const logged = await asAdmin("/api/admin/audit?action=admin.rules_published&size=10");
    check("rules: both publications are in the audit log, with the reason", logged.json.rows?.filter((r) => r.detail?.domain === "MATCHING").length >= 2 && logged.json.rows.some((r) => r.detail?.reason === "e2e: one more hour" && r.detail?.changed === "batchHours"));
    for (const p of ["/app/en/admin/rules", "/app/fr/admin/rules"]) {
      check(`pages: ${p} renders for an administrator and is a 404 for a person`, (await asAdmin(p)).status === 200 && (await web(p, { cookie: user.cookie, ip: ADMIN_IP_HEADER })).status === 404);
    }
    // Leave the rule sets as the seed wrote them: the batch scenarios below publish their own version 2.
    await sql("delete from rule_sets where domain = 'MATCHING' and version > $1", [active.version]);
    await sql("update rule_sets set active = true where domain = 'MATCHING' and version = $1", [active.version]);
  }

  // The QA reset, from the console: a QA address only, operators only.
  {
    const asAdmin = (path, init = {}) => web(path, { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER, ...init });
    check("qa reset: refused to a person (403)", (await web("/api/admin/qa-reset", { method: "POST", cookie: user.cookie, ip: ADMIN_IP_HEADER, body: { email: QA_USER.email } })).status === 403);
    check("qa reset: never a real person's address (422)", (await asAdmin("/api/admin/qa-reset", { method: "POST", body: { email: "camille@example.com" } })).json.code === "QA_RESET_REFUSED");
    const reset = await asAdmin("/api/admin/qa-reset", { method: "POST", body: { email: QA_USER.email } });
    check("qa reset: a QA account starts from a blank page again (ONBOARDING), and it is in the audit log", reset.status === 200 && (await sql("select s.state::text as state from agent_sessions s join accounts a on a.id = s.account_id where a.email = $1", [QA_USER.email])).every((r) => r.state === "ONBOARDING") && (await asAdmin("/api/admin/audit?action=admin.qa_reset&size=5")).json.rows?.length >= 1);
  }

  // The console's pages.
  const page = (p, cookie, ip) => web(p, { cookie, ip });
  check("pages: the sign-in page is served (200) and not indexed", (await page("/app/en/sign-in")).status === 200 && (await page("/app/en/sign-in")).text.includes("noindex"));
  check("pages: a form submitted without JavaScript never puts a password in the address (method=post)", (await page("/app/en/sign-in")).text.includes('method="post"'));
  check("pages: the home without a session goes to sign-in", (await page("/app/en")).status === 307 && (await page("/app/en")).headers.get("location")?.endsWith("/app/en/sign-in"));
  check("pages: the home, the account render for a person", (await page("/app/en", user.cookie)).status === 200 && (await page("/app/fr/account", user.cookie)).status === 200);
  const talkEn = await page("/app/en/talk", user.cookie);
  const talkFr = await page("/app/fr/talk", user.cookie);
  check("pages: the talk page renders for a person in both languages, with its conversation log and composer, and not for a stranger", talkEn.status === 200 && talkFr.status === 200 && /role="log"/.test(talkEn.text) && /<textarea/.test(talkEn.text) && talkEn.text.includes("Talk to your agent") && talkFr.text.includes("Parle à ton agent") && (await page("/app/en/talk")).status === 307);
  const batchEn = await page("/app/en/batch", user.cookie);
  const batchFr = await page("/app/fr/batch", user.cookie);
  check("pages: the batch page renders for a person in both languages (talk-first while nothing is written) and not for a stranger", batchEn.status === 200 && batchFr.status === 200 && batchEn.text.includes("Your batch") && batchFr.text.includes("Ton lot") && (await page("/app/en/batch")).status === 307);
  const introsEn = await page("/app/en/intros", user.cookie);
  const introsFr = await page("/app/fr/intros", user.cookie);
  check("pages: the introductions render for a person in both languages, and not for a stranger; someone else's intro is a 404", introsEn.status === 200 && introsFr.status === 200 && introsEn.text.includes("Introductions") && introsFr.text.includes("Présentations") && (await page("/app/en/intros")).status === 307 && (await page(`/app/en/intros/${crypto.randomUUID()}`, user.cookie)).status === 404);
  check("pages: the administration console is a 404 for a person", (await page("/app/en/admin/users", user.cookie, ADMIN_IP_HEADER)).status === 404 && (await page("/app/en/admin/audit", user.cookie, ADMIN_IP_HEADER)).status === 404);
  check("pages: ...and for an administrator on a wrong address", (await page("/app/en/admin/users", adminIn.cookie, "198.51.100.200")).status === 404);
  check("pages: ...and renders for an administrator on the allowed address", (await page("/app/en/admin/users", adminIn.cookie, ADMIN_IP_HEADER)).status === 200 && (await page(`/app/fr/admin/users/${someone.id}`, adminIn.cookie, ADMIN_IP_HEADER)).status === 200);

  // Delete my account, from the web.
  const doomed = await signUp("doomed");
  await sql("insert into audit_log (actor_id, actor_label, action, target_id) values ($1, $2, 'auth.sign_in', $1)", [doomed.id, doomed.email]);
  const gone = await sql("select id from accounts where id = $1", [doomed.id]);
  await sql("insert into web_sessions (account_id, token_hash, expires_at) values ($1, encode(sha256(convert_to('yw1.' || repeat('d', 43), 'UTF8')), 'hex'), now() + interval '1 day')", [doomed.id]);
  const doomedCookie = "yasakia_session=yw1." + "d".repeat(43);
  const del = await web("/api/me", { method: "DELETE", cookie: doomedCookie });
  check("account: delete my account works from the web console and clears the cookie", gone.length === 1 && del.status === 200 && /Max-Age=0/.test(del.headers.get("set-cookie") ?? ""), del.json);
  check("account: ...everything is gone, the audit log keeps no address", (await sql("select 1 from accounts where id = $1", [doomed.id])).length === 0 && (await sql("select 1 from audit_log where actor_label = $1", [doomed.email])).length === 0 && (await sql("select 1 from audit_log where action = 'account.deleted' and target_id = $1", [doomed.id])).length === 1);
  const signOut = await web("/api/auth/sign-out", { method: "POST", cookie: adminIn.cookie });
  check("sign-out: ends the session and clears the cookie", signOut.status === 200 && (await web("/api/me", { cookie: adminIn.cookie })).status === 401);
}

// ── The web pages ───────────────────────────────────────────────────────────────────────────────────
{
  for (const [p, lang] of [["/en/privacy", "en"], ["/fr/privacy", "fr"], ["/en/terms", "en"], ["/fr/delete-account", "fr"]]) {
    const r = await fetch(B + p);
    const html = await r.text();
    check(`${p} is served in its language`, r.status === 200 && html.includes(`lang="${lang}"`));
  }
  const bare = await fetch(`${B}/privacy`, { redirect: "manual", headers: { "Accept-Language": "fr-CA,fr;q=0.9" } });
  check("/privacy goes to the reader's language", bare.status === 307 && bare.headers.get("location")?.endsWith("/fr/privacy"));
  check("any other address is a 404", (await fetch(`${B}/en/batches`)).status === 404);
  for (const [p, lang] of [["/", "en"], ["/fr/", "fr"], ["/how-it-works", "en"], ["/fr/demo", "fr"]]) {
    const r = await fetch(B + p);
    check(`the public landing ${p} is served by the same app, in ${lang}`, r.status === 200 && (await r.text()).includes(`lang="${lang}"`));
  }
  check("the landing keeps its robots.txt, sitemap.xml and llms.txt", (await fetch(`${B}/robots.txt`)).status === 200 && (await fetch(`${B}/sitemap.xml`)).status === 200 && (await fetch(`${B}/llms.txt`)).status === 200);
}

// ── The agent: talk first (PY3) — a conversation, what it understood, the portrait, its two vectors ─────────
{
  const STUB = env("ORAZAKA_STUB_URL", "http://127.0.0.1:4599");
  const CLOSED = env("CLOSED_URL", "");
  const runsOfStub = async () => (await fetch(`${STUB}/__control/runs`)).json();
  const control = (what) => fetch(`${STUB}/__control/${what}`, { method: "POST" });
  const count = async (purpose, id) => Number((await sql("select count(*)::int as n from ai_calls where purpose = $1 and account_id = $2", [purpose, id]))[0].n);
  const waitFor = async (fn, ms = 15000) => {
    for (let t = 0; t < ms; t += 100) {
      const v = await fn();
      if (v) return v;
      await sleep(100);
    }
    return null;
  };

  check("agent: no session, no agent (401)", (await call("/api/agent")).status === 401 && (await call("/api/agent/messages", { method: "POST", body: { content: "hi" } })).status === 401);

  const camille = await signUp("camille", { birthDate: "1990-06-02" });
  const first = await call("/api/agent", { token: camille.token, ip: camille.ip });
  check("agent: a new person starts onboarding, with every basic still to learn and nothing understood", first.status === 200 && first.json.agent.state === "ONBOARDING" && first.json.agent.messages.length === 0 && first.json.agent.missingBasics.length === 5 && first.json.agent.facets.length === 0 && first.json.agent.portrait === null, first.json);

  const say = (content) => call("/api/agent/messages", { method: "POST", token: camille.token, body: { content }, ip: camille.ip });
  check("agent: an empty message and a huge one are refused (400)", (await say("   ")).status === 400 && (await say("x".repeat(5000))).status === 400);
  check("agent: unknown fields are refused", (await call("/api/agent/messages", { method: "POST", token: camille.token, body: { content: "hi", role: "AGENT" }, ip: camille.ip })).status === 400);

  const talk = [
    "My name is Camille. I am a woman and I live in Montréal.",
    "I am looking for men between 30 and 44 within 30 km, for a long-term relationship.",
    "On weekends I hike Mont Royal and cook with friends. I value kindness, curiosity and honesty.",
    "I laugh at terrible puns. I cannot stand people who are always on their phone, or late.",
    "I hope to meet someone curious who reads, cooks and listens.",
  ];
  const sent = [];
  for (const [i, line] of talk.entries()) {
    const r = await say(line);
    sent.push(r);
    check(`agent: message ${i + 1} is answered by the agent`, r.status === 200 && r.json.message?.role === "AGENT" && r.json.message.content.length > 10, r.json);
    // The understanding of a turn runs after its answer: wait for it before the next word, as a person typing would.
    await waitFor(async () => (await count("EXTRACT", camille.id)) >= i + 1);
    if (i === 0) {
      const view = await call("/api/agent", { token: camille.token, ip: camille.ip });
      check("agent: after one message it knows her name and city, and still asks for the rest", view.json.agent.missingBasics.includes("intent") && !view.json.agent.missingBasics.includes("gender") && !view.json.agent.missingBasics.includes("place") && view.json.agent.state === "ONBOARDING", view.json.agent);
    }
  }

  const done = await waitFor(async () => {
    const v = await call("/api/agent", { token: camille.token, ip: camille.ip });
    return v.json.agent.state === "WAITING_POOL" ? v : null;
  });
  check("agent: after five messages the portrait is written and the agent waits for people to fit (WAITING_POOL)", !!done, (await call("/api/agent", { token: camille.token, ip: camille.ip })).json.agent);
  const agent = done?.json.agent;
  check("agent: the portrait is in words, both ways, and the closing message is the last word", agent?.portrait?.self.length > 20 && agent.portrait.seeking.length > 10 && agent.messages.at(-1).role === "AGENT" && /good picture/.test(agent.messages.at(-1).content), agent?.messages?.at(-1));
  check("agent: what it understood is hers — story, weekend, values, humour, seeking, and the sealed dealbreakers", ["story", "weekend", "values", "humour", "seeking", "dealbreakers"].every((k) => agent?.facets.some((f) => f.key === k)), agent?.facets.map((f) => f.key));
  check("agent: no score, no similarity anywhere in the agent's answers", !/"(score|similarity)"/i.test(JSON.stringify(done?.json ?? {})));

  const profile = (await sql("select gender::text, seeking_genders::text[] as seeking, age_min, age_max, intent::text, radius_km, lat, lng, geo_precision_m, display_name, onboarding_completed_at from profiles where account_id = $1", [camille.id]))[0];
  check("agent: the basics she said are her filters — woman, looks for men 30 to 44, long-term, 30 km, Montréal, name Camille", profile.gender === "WOMAN" && profile.seeking?.join() === "MAN" && profile.age_min === 30 && profile.age_max === 44 && profile.intent === "LONG_TERM" && profile.radius_km === 30 && Math.abs(profile.lat - 45.5) < 0.2 && Math.abs(profile.lng + 73.57) < 0.2 && profile.display_name === "Camille" && !!profile.onboarding_completed_at, profile);
  check("agent: a city's centre says so in its precision (10 km), never the phone's 1 km", profile.geo_precision_m === 10000, profile.geo_precision_m);
  const sealed = await sql("select key, value is null as no_clear, value_sealed is not null as sealed from facets where account_id = $1 and sensitive", [camille.id]);
  check("agent: sensitive facets (dealbreakers) are sealed at rest — no clear value", sealed.length >= 1 && sealed.every((r) => r.no_clear && r.sealed), sealed);
  const vectors = await sql("select kind::text, vector_dims(vector) as dims, model from facet_embeddings where account_id = $1 order by kind", [camille.id]);
  check("agent: two vectors per person (SELF, SEEKING), 1024 dimensions, with the model that made them", vectors.map((v) => v.kind).join() === "SEEKING,SELF" && vectors.every((v) => v.dims === 1024 && v.model === "gte-large-en-v1.5"), vectors);
  const calls = await sql("select purpose::text, count(*)::int as n, bool_and(ok) as ok from ai_calls where account_id = $1 group by purpose", [camille.id]);
  const by = Object.fromEntries(calls.map((c) => [c.purpose, c]));
  check("agent: every call to a model is on the cost dashboard — chat, extract, portrait, embed — through Orazaka", by.CHAT?.n >= 6 && by.EXTRACT?.n >= 5 && by.PORTRAIT?.n === 1 && by.EMBED?.n === 1 && calls.every((c) => c.ok), calls);
  const runs = await runsOfStub();
  check("agent: the stand-in saw those calls — one conversation id per turn, forgotten after each, one embedding run", runs.chats.length >= 12 && new Set(runs.chats.map((c) => c.id)).size === runs.chats.length && (await waitFor(async () => (await runsOfStub()).forgotten.length >= runs.chats.length)) && runs.embeddings.length >= 1, { chats: runs.chats.length });

  const late = await say("One more thing.");
  check("agent: once the portrait is written the conversation is closed (409 CONVERSATION_CLOSED)", late.status === 409 && late.json.code === "CONVERSATION_CLOSED", late.json);

  // The engine goes down: the agent says so (503) and the person's message is taken back — nothing half-written.
  const bruno = await signUp("bruno", { birthDate: "1988-03-09" });
  await control("down");
  const sayB = (content) => call("/api/agent/messages", { method: "POST", token: bruno.token, body: { content }, ip: bruno.ip });
  const downed = await sayB("Hello, my name is Bruno.");
  const leftover = await sql("select count(*)::int as n from agent_messages m join agent_sessions s on s.id = m.session_id where s.account_id = $1", [bruno.id]);
  check("agent: with the engine down, a message is a 503 AI_UNAVAILABLE and leaves no half-turn behind", downed.status === 503 && downed.json.code === "AI_UNAVAILABLE" && !/oz_|stub|127\.0\.0\.1/.test(JSON.stringify(downed.json)) && leftover[0].n === 0, { status: downed.status, json: downed.json, leftover });
  await control("up");
  check("agent: …and it answers again when the engine is back", (await sayB("Hello, my name is Bruno.")).status === 200);

  // Not configured: fail closed, never a stand-in.
  if (CLOSED) {
    const noAi = await fetch(`${CLOSED}/api/agent/messages`, { method: "POST", headers: { Authorization: `Bearer ${bruno.token}`, "Content-Type": "application/json", "X-Forwarded-For": bruno.ip }, body: JSON.stringify({ content: "Hello" }) });
    check("agent: without AI_ENGINE_URL the agent answers 503 — no demo mode, no fake reply", noAi.status === 503, noAi.status);
  }

  // One turn at a time.
  const carla = await signUp("carla", { birthDate: "1991-01-20" });
  const turnA = call("/api/agent/messages", { method: "POST", token: carla.token, body: { content: "My name is Carla." }, ip: carla.ip });
  const turnB = call("/api/agent/messages", { method: "POST", token: carla.token, body: { content: "And I am a woman." }, ip: carla.ip });
  const both = await Promise.all([turnA, turnB]);
  check("agent: two messages at once — one is answered, the other is told to wait (409 TURN_IN_PROGRESS)", both.map((r) => r.status).sort().join() === "200,409" && both.some((r) => r.json.code === "TURN_IN_PROGRESS"), both.map((r) => [r.status, r.json.code]));

  // The person's agent is theirs alone.
  check("agent: someone else's conversation is not readable — each person sees only their own", (await call("/api/agent", { token: carla.token, ip: carla.ip })).json.agent.messages.every((m) => !/Camille/.test(m.content)));

  // ── The first batch: three to five people who fit both ways, and why you two ─────────────────────────────────────────
  {
    const vec = (text) => `[${vectorOf(text).join(",")}]`;
    /** A person who finished talking to the agent, written straight into the tables (the engine's stand-in embeds their texts). */
    async function seedPerson(slug, { gender = "MAN", seeking = ["WOMAN"], age = 34, ageMin = 28, ageMax = 40, intent = "LONG_TERM", radiusKm = 20, lat = 45.52, lng = -73.58, self = "", wants = "", name = slug, state = "WAITING_POOL", status = "ACTIVE" } = {}) {
      const email = `persona+${slug}-${run}@personas.yasakia.test`;
      const birth = `${2026 - age}-03-10`;
      const [account] = await sql("insert into accounts (email, locale, birth_date, terms_accepted_at, consent_version, status) values ($1, 'en', $2, now(), '2026-10', $3) returning id", [email, birth, status]);
      await sql("insert into profiles (account_id, display_name, gender, seeking_genders, age_min, age_max, intent, radius_km, lat, lng, geo_precision_m, onboarding_completed_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1000, now())", [account.id, name, gender, seeking, ageMin, ageMax, intent, radiusKm, lat, lng]);
      await sql("insert into agent_sessions (account_id, state, portrait) values ($1, $2, $3)", [account.id, state, JSON.stringify({ self: `${name}: ${self}`, seeking: wants, selfEn: self, seekingEn: wants })]);
      await sql("insert into facet_embeddings (account_id, kind, vector, model) values ($1, 'SELF', $2::vector, 'stub'), ($1, 'SEEKING', $3::vector, 'stub')", [account.id, vec(self), vec(wants)]);
      return { id: account.id, name };
    }
    // What Camille said (the stand-in's portrait is made of her own words): she hikes, cooks, values kindness and curiosity, hopes to meet someone curious who reads, cooks and listens.
    const fitSelf = (extra) => `someone curious who reads, cooks and listens; ${extra}`;
    const fitWants = "hike Mont Royal and cook with friends, kindness, curiosity and honesty, terrible puns, not always on the phone";
    const good = [
      await seedPerson("hugo", { name: "Hugo", self: fitSelf("hikes Mont Royal on Sundays"), wants: fitWants }),
      await seedPerson("samuel", { name: "Samuel", age: 36, self: fitSelf("cooks for friends, loves terrible puns"), wants: fitWants }),
      await seedPerson("karim", { name: "Karim", age: 31, self: fitSelf("loves markets and honesty"), wants: fitWants }),
    ];
    const refused = {
      woman: await seedPerson("sophie", { name: "Sophie", gender: "WOMAN", seeking: ["MAN"], self: fitSelf("hikes"), wants: fitWants }), // she does not look for women... Camille looks for men
      old: await seedPerson("olivier", { name: "Olivier", age: 55, ageMin: 30, ageMax: 60, self: fitSelf("reads"), wants: fitWants }), // outside 30-44
      casual: await seedPerson("antoine", { name: "Antoine", intent: "CASUAL", self: fitSelf("free"), wants: fitWants }), // not what a long-term wish looks for
      theyDont: await seedPerson("julien", { name: "Julien", seeking: ["MAN"], self: fitSelf("reads"), wants: fitWants }), // does not look for women
      far: await seedPerson("alexandre", { name: "Alexandre", lat: 46.81, lng: -71.21, radiusKm: 500, self: fitSelf("guides"), wants: fitWants }), // Québec City, outside her 30 km
      blocked: await seedPerson("bruno-blocked", { name: "Blocked", self: fitSelf("hikes"), wants: fitWants }),
      taste: await seedPerson("jeremie", { name: "Jeremie", self: "nightclubs, techno, festivals, gaming until dawn", wants: "dancing nightlife festivals techno, anything but routine", }), // passes the filters, fits nothing she looks for
      oneWay: await seedPerson("matthieu", { name: "Matthieu", self: fitSelf("reads, hikes"), wants: "nightclubs, techno, festivals, gaming until dawn" }), // fits what she looks for, but she is not what he looks for
      paused: await seedPerson("paused", { name: "Paused", self: fitSelf("hikes"), wants: fitWants, status: "PAUSED" }),
      notDone: await seedPerson("early", { name: "Early", self: fitSelf("hikes"), wants: fitWants, state: "ONBOARDING" }),
    };
    await sql("update profiles set onboarding_completed_at = null where account_id = $1", [refused.notDone.id]);
    await sql("insert into blocks (blocker_id, blocked_id) values ($1, $2)", [camille.id, refused.blocked.id]);

    // Not ready: a person still talking has no batch to ask for.
    check("batch: before the portrait is written, asking for a batch is refused (409 NOT_READY)", (await call("/api/batches", { method: "POST", token: carla.token, ip: carla.ip })).json.code === "NOT_READY");
    check("batch: no session, no batch (401), and none to read", (await call("/api/batches", { method: "POST" })).status === 401 && (await call("/api/batches/current")).status === 401);
    check("batch: before one is opened, the current batch is null", (await call("/api/batches/current", { token: camille.token, ip: camille.ip })).json.batch === null);

    // The rules are rows: version 2 of the matching rule set (a looser affinity, for the stand-in's bag of words) is published, version 1 stays as the audit trail.
    await sql("update rule_sets set active = false where domain = 'MATCHING'");
    await sql("insert into rule_sets (domain, version, active, params, reason) values ('MATCHING', 2, true, $1, 'e2e: the stand-in embeds bags of words, so its cosines are lower than a real model has')", [JSON.stringify({ batchMin: 3, batchMax: 5, batchHours: 72, candidatePool: 200, minAffinity: 0.35, introDays: 7 })]);

    // ── The photos: 4 to 6, two with a face — checked by Orazaka, a batch needs them (Oussama's rule: real people) ─────
    {
      const COLORS = { FACE_A: { r: 220, g: 40, b: 40 }, FACE_B: { r: 40, g: 40, b: 220 }, GROUP: { r: 40, g: 220, b: 220 }, NONE: { r: 20, g: 184, b: 166 }, TEXT: { r: 250, g: 250, b: 250 }, SCREENSHOT: { r: 230, g: 230, b: 40 }, MINOR: { r: 230, g: 40, b: 230 } };
      const paint = (what) => sharp({ create: { width: 640, height: 800, channels: 3, background: COLORS[what] } }).jpeg({ quality: 92 }).toBuffer();
      const add = async (user, what) => (await uploadPhoto(user, await paint(what))).id;
      const checkOf = async (user) => (await call("/api/me/photos/check", { token: user.token, ip: user.ip })).json.check;
      const settle = (user, states = ["PASSED", "FAILED", "UNAVAILABLE"]) => waitFor(async () => {
        const c = await checkOf(user);
        return states.includes(c.state) ? c : null;
      }, 30000);
      const rest = async () => (await runsOfStub()).photoChecks.length;

      check("photos: no session, no check (401)", (await call("/api/me/photos/check")).status === 401 && (await call("/api/me/photos/check", { method: "POST" })).status === 401);
      const empty = await checkOf(camille);
      check("photos: a person with none is EMPTY, with the rules from the database (4 to 6, two with a face) and nothing to show", empty.state === "EMPTY" && empty.verified === false && empty.rules.minPhotos === 4 && empty.rules.maxPhotos === 6 && empty.rules.minFacePhotos === 2 && empty.photos.length === 0, empty);
      const sentBefore = await rest();
      check("photos: nothing to check is a 409 NO_PHOTOS, and nothing is sent to the engine", (await call("/api/me/photos/check", { method: "POST", token: camille.token, ip: camille.ip })).json.code === "NO_PHOTOS" && (await rest()) === sentBefore);

      // The gate: without photos that passed, no batch — the refusal says what is missing, in codes.
      const gated = await call("/api/batches", { method: "POST", token: camille.token, body: { locale: "en" }, ip: camille.ip });
      check("photos: without photos that passed, a batch is refused — 409 PHOTOS_REQUIRED, with the rules and the state", gated.status === 409 && gated.json.code === "PHOTOS_REQUIRED" && gated.json.rules?.minPhotos === 4 && gated.json.state === "EMPTY", gated.json);

      // Three photos, two with a face: the engine reads them as they come; too few is a blocker, not a failure of the photos.
      await add(camille, "FACE_A");
      await add(camille, "FACE_A");
      await add(camille, "NONE");
      const few = await settle(camille);
      check("photos: three photos (two faces) — FAILED only for TOO_FEW_PHOTOS; each photo says what the engine found", few?.state === "FAILED" && few.blockers.map((b) => b.code).join() === "TOO_FEW_PHOTOS" && few.photos.map((p) => p.check).join() === "FACE,FACE,NO_FACE" && few.counts.facePhotos === 2, few);
      check("photos: …and a batch is still refused", (await call("/api/batches", { method: "POST", token: camille.token, body: { locale: "en" }, ip: camille.ip })).json.code === "PHOTOS_REQUIRED");

      // A photo with something written on it, a screenshot, someone who looks under 18 — each named by photo.
      const text = await add(camille, "TEXT");
      const textual = await settle(camille);
      check("photos: a photo with text over it is TEXT_OR_CONTACT — on that photo, and it blocks", textual?.state === "FAILED" && textual.blockers.some((b) => b.code === "TEXT_OR_CONTACT" && b.photos.join() === text) && textual.photos.find((p) => p.id === text).findings.includes("TEXT_OR_CONTACT"), textual);
      await call(`/api/me/photos/${text}`, { method: "DELETE", token: camille.token, ip: camille.ip });
      const shot = await add(camille, "SCREENSHOT");
      const minor = await add(camille, "MINOR");
      const bad = await settle(camille);
      check("photos: a screenshot is SCREENSHOT and someone who looks under 18 is MINOR_LIKELY, each on its own photo", bad?.blockers.some((b) => b.code === "SCREENSHOT" && b.photos.join() === shot) && bad.blockers.some((b) => b.code === "MINOR_LIKELY" && b.photos.join() === minor), bad);
      await call(`/api/me/photos/${shot}`, { method: "DELETE", token: camille.token, ip: camille.ip });
      await call(`/api/me/photos/${minor}`, { method: "DELETE", token: camille.token, ip: camille.ip });

      // A face that is not the same person — compared only with the person's own, separate agreement (Québec Law 25).
      const stranger = await add(camille, "FACE_B");
      const uncompared = await settle(camille);
      check("photos: without her agreement faces are only counted — a face of someone else is not flagged, the view says it waits for her consent", uncompared?.comparison === "NEEDS_CONSENT" && !uncompared.blockers.some((b) => b.code === "FACE_MISMATCH") && (await runsOfStub()).photoChecks.every((r) => r.compareFaces === false), { comparison: uncompared?.comparison });
      check("photos: …and the consent is not given by default", (await call("/api/me/photos/consent", { token: camille.token, ip: camille.ip })).json.consent.given === false);
      check("photos: a consent to another wording, or none, is refused (400); a visitor gets 401", (await call("/api/me/photos/consent", { method: "PUT", token: camille.token, body: { version: "1999-01" }, ip: camille.ip })).status === 400 && (await call("/api/me/photos/consent", { method: "PUT", token: camille.token, body: {}, ip: camille.ip })).status === 400 && (await call("/api/me/photos/consent", { method: "PUT", body: { version: "2026-10" } })).status === 401);
      const agreed = await call("/api/me/photos/consent", { method: "PUT", token: camille.token, body: { version: "2026-10" }, ip: camille.ip });
      check("photos: she agrees to the comparison — the photos are checked again, with it", agreed.status === 200 && agreed.json.check.comparison === "ON" && (await call("/api/me/photos/consent", { token: camille.token, ip: camille.ip })).json.consent.given === true);
      const mismatch = await settle(camille);
      check("photos: a face that clearly is not the same person is FACE_MISMATCH, on that photo — and does not count as a face photo", mismatch?.state === "FAILED" && mismatch.blockers.some((b) => b.code === "FACE_MISMATCH" && b.photos.join() === stranger) && mismatch.counts.facePhotos === 2, mismatch);
      check("photos: the engine was told to compare only after her agreement", (await runsOfStub()).photoChecks.at(-1).compareFaces === true);
      await call(`/api/me/photos/${stranger}`, { method: "DELETE", token: camille.token, ip: camille.ip });

      // A group photo is no face photo; the fourth good photo passes the set.
      const group = await add(camille, "GROUP");
      const passed = await settle(camille);
      check("photos: three plus a group photo — the group photo does not count as a face photo, but four photos with two faces pass", passed?.state === "PASSED" && passed.verified === true && passed.counts.photos === 4 && passed.counts.facePhotos === 2 && passed.photos.find((p) => p.id === group).check === "GROUP", passed);
      check("photos: the answer is words' keys — codes only, never a score, a similarity or a vector", !/score|similar|cosine|embedding|vector/i.test(JSON.stringify(passed)) && !/score|similar|cosine|embedding|vector/i.test(JSON.stringify((await sql("select report from photo_checks where account_id = $1", [camille.id])).map((r) => r.report))));

      // The photos that were read are taken back from the engine; and only one check is kept per set.
      const seen = await runsOfStub();
      check("photos: every thumbnail sent to Orazaka was deleted from its file store when the check ended", seen.assets.uploaded.length > 0 && (await waitFor(async () => (await runsOfStub()).assets.deleted.length === seen.assets.uploaded.length)) !== null);
      const hashRows = await sql("select status, passes, rules_version, engine_run_id, set_hash = photo_set_hash(account_id) as current from photo_checks where account_id = $1 order by created_at desc limit 1", [camille.id]);
      check("photos: the verdict belongs to this very set (hash), carries the rules' version and the engine's run id — the proof of use", hashRows[0].status === "DONE" && hashRows[0].passes === true && hashRows[0].current === true && hashRows[0].rules_version === 1 && Boolean(hashRows[0].engine_run_id));
      const idem = await rest();
      const again = await call("/api/me/photos/check", { method: "POST", token: camille.token, ip: camille.ip });
      check("photos: asking again for a set already checked is answered by that verdict — 202, nothing new sent to the engine", again.status === 202 && again.json.check.state === "PASSED" && (await rest()) === idem, again.json);

      // Changing the set makes the verdict stale at once: a photo added is pending, and a new check starts by itself.
      const sixth = await add(camille, "FACE_A");
      const fresh = await checkOf(camille);
      check("photos: a photo added after the verdict is not covered by it (never carried over) — the set is checked again", fresh.photos.find((p) => p.id === sixth).check === "PENDING" || fresh.state === "PASSED", fresh);
      await settle(camille, ["PASSED"]);

      // The bounds are the database's: lower the maximum and a further photo is refused.
      await sql("update rule_sets set active = false where domain = 'PHOTOS'");
      await sql("insert into rule_sets (domain, version, active, params, reason) values ('PHOTOS', 2, true, $1, 'e2e: five photos at most')", [JSON.stringify({ minPhotos: 4, maxPhotos: 5, minFacePhotos: 2 })]);
      const over = await uploadPhoto(camille, await paint("NONE"));
      check("photos: the maximum is a rule set — at five, the sixth is refused (409 TOO_MANY_PHOTOS, max 5)", over.start.status === 409 && over.start.json.code === "TOO_MANY_PHOTOS" && over.start.json.max === 5, over.start.json);
      await sql("delete from rule_sets where domain = 'PHOTOS' and version = 2");
      await sql("update rule_sets set active = true where domain = 'PHOTOS' and version = 1");
      await call(`/api/me/photos/${sixth}`, { method: "DELETE", token: camille.token, ip: camille.ip });
      await settle(camille, ["PASSED"]);

      // The engine out of reach: the photos are safe, the state says so, and asking again works when it is back.
      await control("down");
      const seventh = await add(camille, "FACE_A");
      const down = await settle(camille, ["UNAVAILABLE", "PASSED", "FAILED"]);
      check("photos: with the engine down the check is UNAVAILABLE — not failed, not passed, the photos are kept", down?.state === "UNAVAILABLE" && down.verified === false && (await call("/api/me/photos", { token: camille.token, ip: camille.ip })).json.photos.some((p) => p.id === seventh), down);
      await control("up");
      const retried = await call("/api/me/photos/check", { method: "POST", token: camille.token, ip: camille.ip });
      check("photos: …and asking again when it is back works", retried.status === 202 && (await settle(camille, ["PASSED"]))?.verified === true);
      await call(`/api/me/photos/${seventh}`, { method: "DELETE", token: camille.token, ip: camille.ip });
      await settle(camille, ["PASSED"]);
      check("photos: someone else never reads another person's check (it is the caller's own)", (await checkOf(carla)).state === "EMPTY");
      const withdrawn = await call("/api/me/photos/consent", { method: "DELETE", token: camille.token, ip: camille.ip });
      await settle(camille);
      check("photos: she takes her agreement back — faces are only counted again, at once, and nothing biometric was ever stored", withdrawn.status === 200 && (await call("/api/me/photos/consent", { token: camille.token, ip: camille.ip })).json.consent.given === false && (await waitFor(async () => (await runsOfStub()).photoChecks.at(-1).compareFaces === false)) !== null && Number((await sql("select count(*)::int as n from information_schema.columns where table_name in ('photo_checks', 'biometric_consents') and (column_name ~* '(vector|embedding|template|score|similar)')"))[0].n) === 0);
    }

    check("batch: the language asked for is en or fr — anything else is refused (400), on the batch and on the talk", (await call("/api/batches", { method: "POST", token: camille.token, body: { locale: "de" }, ip: camille.ip })).status === 400 && (await call("/api/agent/messages", { method: "POST", token: camille.token, body: { content: "hi", locale: "de" }, ip: camille.ip })).status === 400);
    const opened = await call("/api/batches", { method: "POST", token: camille.token, body: { locale: "en" }, ip: camille.ip });
    check("batch: the agent opens a batch for her — 201", opened.status === 201 && opened.json.batch?.people >= 3, opened.json);
    const current = await call("/api/batches/current", { token: camille.token, ip: camille.ip });
    const names = (current.json.batch?.people ?? []).map((p) => p.name).sort();
    check("batch: it is exactly the people who fit both ways — Hugo, Samuel and Karim", names.join() === "Hugo,Karim,Samuel", names);
    check("batch: nobody the filters refuse is in it — not a woman, too old, casual, not looking for her, too far, blocked, paused, unfinished", Object.entries(refused).filter(([k]) => !["taste", "oneWay"].includes(k)).every(([, who]) => !names.includes(who.name)));
    check("batch: …nor someone who fits only one way — a different taste, or one who is what she looks for but she is not what he looks for", !names.includes("Jeremie") && !names.includes("Matthieu"), names);
    const people = current.json.batch.people;
    check("batch: each person comes with why you two, in words, both ways — and a rank, never a number of fit", people.every((p) => p.reasons.forYou.length >= 1 && p.reasons.forThem.length >= 1 && p.rank >= 1 && !("score" in p) && !("similarity" in p) && !("affinity" in p)), people[0]);
    check("batch: the people are marked fictional personas, and carry their portrait in their words", people.every((p) => p.fictional === true && p.about.length > 5), people[0]);
    check("batch: it is open for the rule set's 72 hours", Math.abs(new Date(current.json.batch.expiresAt) - new Date(current.json.batch.openedAt) - 72 * 3600 * 1000) < 1000 && current.json.batch.status === "OPEN");
    const rows = await sql("select (select count(*)::int from batch_items bi join batches b on b.id = bi.batch_id where b.account_id = $1) as items, (select count(*)::int from pairs_seen where account_id = $1) as seen, (select count(*)::int from ai_calls where account_id = $1 and purpose = 'REASONS' and ok and run_ref is not null) as reasons, (select state::text from agent_sessions where account_id = $1) as state, (select count(*)::int from rule_sets where domain = 'MATCHING') as versions", [camille.id]);
    check("batch: three items, three pairs now seen, one REASONS call for the whole batch with its run id, the agent is BATCH_OPEN, and both versions of the rule set remain", rows[0].items === 3 && rows[0].seen === 3 && rows[0].reasons === 1 && rows[0].state === "BATCH_OPEN" && rows[0].versions === 2, rows[0]);
    check("batch: a second batch cannot be asked for while this one is open (409 BATCH_ALREADY_OPEN)", (await call("/api/batches", { method: "POST", token: camille.token, ip: camille.ip })).json.code === "BATCH_ALREADY_OPEN");
    check("batch: the batch is hers alone — someone else reads none", (await call("/api/batches/current", { token: carla.token, ip: carla.ip })).json.batch === null);
    await sql("update batch_items set withdrawn_at = now() where candidate_id = $1", [good[0].id]);
    check("batch: someone withdrawn (a block, a deletion) is gone from it", (await call("/api/batches/current", { token: camille.token, ip: camille.ip })).json.batch.people.length === 2);

    // Nobody fits: the person waits, and nobody is made up.
    const lonely = await signUp("lonely", { birthDate: "1990-02-02" });
    await sql("update accounts set status = 'ACTIVE' where id = $1", [lonely.id]);
    await sql("insert into profiles (account_id) values ($1) on conflict do nothing", [lonely.id]);
    await sql("update profiles set display_name = 'Lonely', gender = 'WOMAN', seeking_genders = '{WOMAN}', age_min = 18, age_max = 99, intent = 'NOT_SURE', radius_km = 5, lat = -33.86, lng = 151.2, onboarding_completed_at = now() where account_id = $1", [lonely.id]);
    await sql("insert into agent_sessions (account_id, state, portrait) values ($1, 'WAITING_POOL', $2) on conflict (account_id) do update set state = 'WAITING_POOL', portrait = excluded.portrait", [lonely.id, JSON.stringify({ self: "x", seeking: "y" })]);
    await sql("insert into facet_embeddings (account_id, kind, vector, model) values ($1, 'SELF', $2::vector, 'stub'), ($1, 'SEEKING', $2::vector, 'stub') on conflict (account_id, kind) do nothing", [lonely.id, vec("nothing alike anywhere")]);
    for (let i = 0; i < 4; i++) await sql("insert into profile_photos (account_id, storage_key, mime_type, bytes, moderation_status, position, upload_expires_at) values ($1, $2, 'image/jpeg', 100, 'APPROVED', $3, now())", [lonely.id, `photos/${lonely.id}/seeded-${i}.jpg`, i]);
    await sql("insert into photo_checks (account_id, status, set_hash, photo_ids, rules_version, passes, report) values ($1, 'DONE', photo_set_hash($1), (select array_agg(id order by position) from profile_photos where account_id = $1), 1, true, $2::jsonb)", [lonely.id, JSON.stringify({ photos: [0, 1, 2, 3].map((index) => ({ index, kind: index < 2 ? 'FACE' : 'NO_FACE', faceCount: index < 2 ? 1 : 0, findings: [] })), counts: { photos: 4, facePhotos: 2 }, blockers: [], passes: true })]);
    const none = await call("/api/batches", { method: "POST", token: lonely.token, ip: lonely.ip });
    check("batch: when fewer than three fit both ways it is a 409 NO_FIT_YET — the person stays in WAITING_POOL, nobody is invented", none.status === 409 && none.json.code === "NO_FIT_YET" && (await sql("select state::text from agent_sessions where account_id = $1", [lonely.id]))[0].state === "WAITING_POOL", none.json);
    check("batch: an engine out of reach is a 503 AI_UNAVAILABLE and leaves no half-batch", await (async () => {
      await sql("update agent_sessions set state = 'WAITING_POOL' where account_id = $1", [camille.id]);
      await sql("delete from batches where account_id = $1", [camille.id]);
      await sql("delete from pairs_seen where account_id = $1", [camille.id]);
      await control("down");
      const down = await call("/api/batches", { method: "POST", token: camille.token, ip: camille.ip });
      await control("up");
      const left = (await sql("select count(*)::int as n from batches where account_id = $1", [camille.id]))[0].n;
      return down.status === 503 && down.json.code === "AI_UNAVAILABLE" && left === 0 && (await sql("select state::text from agent_sessions where account_id = $1", [camille.id]))[0].state === "WAITING_POOL";
    })());

    // Answering the batch, the debrief, the introduction — the loop, end to end.
    {
      const as = (path, init = {}) => call(path, { token: camille.token, ip: camille.ip, ...init });
      check("loop: a new batch opens once the engine is back", (await as("/api/batches", { method: "POST", body: { locale: "en" } })).status === 201);
      const batch = (await as("/api/batches/current")).json.batch;
      const [first, ...rest] = batch.people;
      const decide = (item, decision) => as(`/api/batches/${batch.id}/items/${item.id}/decision`, { method: "POST", body: { decision } });
      check("loop: an answer outside the three is refused (400), someone not in my batch is a 404", (await decide(first, "MAYBE")).status === 400 && (await as(`/api/batches/${batch.id}/items/${crypto.randomUUID()}/decision`, { method: "POST", body: { decision: "PASS" } })).status === 404);
      check("loop: someone else's batch cannot be answered (404)", (await call(`/api/batches/${batch.id}/items/${first.id}/decision`, { method: "POST", token: carla.token, ip: carla.ip, body: { decision: "PASS" } })).status === 404);
      const more = await decide(first, "TELL_ME_MORE");
      check("loop: « tell me more » opens who they hope to meet, in their words — once", more.status === 200 && typeof more.json.lookingFor === "string" && more.json.lookingFor.length > 5 && more.json.introId === null && (await decide(first, "TELL_ME_MORE")).json.code === "ALREADY_DECIDED");
      const yes = await decide(first, "INTERESTED");
      const intro = yes.json.introId ? (await sql("select account_a, account_b, state, expires_at - opened_at as length from intros where id = $1", [yes.json.introId]))[0] : null;
      check("loop: yes to someone who says yes back opens an introduction, for the rule set's seven days", yes.status === 200 && !!intro && intro.state === "OPEN" && intro.length.days === 7 && [intro.account_a, intro.account_b].includes(camille.id), yes.json);
      check("loop: no agent wrote a first line — the AI is never asked for one (no OPENER call, and the columns are gone)", (await sql("select count(*)::int as n from ai_calls where purpose = 'OPENER'"))[0].n === 0 && (await sql("select count(*)::int as n from information_schema.columns where table_name = 'intros' and column_name like 'opener%'"))[0].n === 0);
      check("loop: a yes is final (409 ALREADY_DECIDED)", (await decide(first, "PASS")).json.code === "ALREADY_DECIDED");
      check("loop: the debrief waits until everyone is answered (409 DEBRIEF_NOT_DUE)", (await as(`/api/batches/${batch.id}/debrief`, { method: "POST", body: { answers: [] } })).status === 400 && (await as(`/api/batches/${batch.id}/debrief`, { method: "POST", body: { answers: [{ questionId: "rangTrue", chips: ["yes"] }, { questionId: "mattered", chips: ["values"] }, { questionId: "next", chips: ["same"] }] } })).json.code === "DEBRIEF_NOT_DUE");
      let last;
      for (const p of rest) last = await decide(p, "PASS");
      check("loop: the last answer makes the debrief due — the agent says so, and no next batch can open before it", last.json.debriefDue === true && (await sql("select state::text from agent_sessions where account_id = $1", [camille.id]))[0].state === "DEBRIEF_DUE" && (await as("/api/batches/current")).json.batch.status === "DEBRIEF_DUE" && (await as("/api/batches", { method: "POST", body: {} })).json.code === "BATCH_ALREADY_OPEN");
      check("loop: a debrief with a chip of another question is refused (400)", (await as(`/api/batches/${batch.id}/debrief`, { method: "POST", body: { answers: [{ questionId: "rangTrue", chips: ["closer"] }, { questionId: "mattered", chips: ["values"] }, { questionId: "next", chips: ["same"] }] } })).status === 400);
      const debrief = await as(`/api/batches/${batch.id}/debrief`, { method: "POST", body: { answers: [{ questionId: "rangTrue", chips: ["partly"] }, { questionId: "mattered", chips: ["values", "humour"] }, { questionId: "next", chips: ["closer"], text: "Closer to the Plateau." }] } });
      check("loop: the debrief is kept, the batch is done, and the agent may look for the next one (WAITING_POOL)", debrief.status === 201 && (await sql("select b.status::text as status, d.answers from batches b join debriefs d on d.batch_id = b.id where b.id = $1", [batch.id]))[0]?.status === "DONE" && (await sql("select state::text from agent_sessions where account_id = $1", [camille.id]))[0].state === "WAITING_POOL" && (await as("/api/batches/current")).json.batch === null);
      check("loop: one debrief per batch (409)", (await as(`/api/batches/${batch.id}/debrief`, { method: "POST", body: { answers: [{ questionId: "rangTrue", chips: ["yes"] }, { questionId: "mattered", chips: ["values"] }, { questionId: "next", chips: ["same"] }] } })).json.code === "DEBRIEF_NOT_DUE");

      const list = await as("/api/intros");
      check("intros: mine are listed, with the other's first name and the time left", list.status === 200 && list.json.intros.length === 1 && list.json.intros[0].id === yes.json.introId && list.json.intros[0].name === first.name && list.json.intros[0].fictional === true);
      const detail = await as(`/api/intros/${yes.json.introId}`);
      check("intros: no endpoint returns a suggested message — the detail carries only who, until when, and the two people's own messages", detail.status === 200 && !("opener" in detail.json.intro) && Object.keys(detail.json.intro).sort().join() === "continuedByMe,continuedByThem,expiresAt,frozen,id,mediaLimits,messages,openedAt,state,them");
      check("intros: nobody else reads it (404), nor writes in it", (await call(`/api/intros/${yes.json.introId}`, { token: carla.token, ip: carla.ip })).status === 404 && (await call(`/api/intros/${yes.json.introId}/messages`, { method: "POST", token: carla.token, ip: carla.ip, body: { body: "hi", clientId: "carla-0001" } })).status === 404);
      const sent = await as(`/api/intros/${yes.json.introId}/messages`, { method: "POST", body: { body: "Salut ! Ton marché préféré ?", clientId: "camille-0001" } });
      const again = await as(`/api/intros/${yes.json.introId}/messages`, { method: "POST", body: { body: "Salut ! Ton marché préféré ?", clientId: "camille-0001" } });
      check("intros: a message is written once, even sent twice (clientId)", sent.status === 201 && again.json.message?.id === sent.json.message.id && (await sql("select count(*)::int as n from intro_messages where intro_id = $1", [yes.json.introId]))[0].n === 1);
      check("intros: an empty message is refused (400)", (await as(`/api/intros/${yes.json.introId}/messages`, { method: "POST", body: { body: "  ", clientId: "camille-0002" } })).status === 400);
      // ── The authenticity signal: a signal, never a verdict, never a number, and it never holds a message back ──────────────────
      {
        const typed = { typedMs: 16000, typedChars: 96, pastedChars: 0, pasteEvents: 0, deletions: 4 };
        const pasted = { typedMs: 500, typedChars: 0, pastedChars: 96, pasteEvents: 1, deletions: 0 };
        const plain = "Salut ! Ton marché préféré, c’est Jean-Talon ou Atwater, et tu y vas avec qui le samedi matin ?";
        const machine = "Hello! I would love to delve into what makes your weekends special, and learn which trail you love most.";
        const doubtful = "What a tapestry of interests you have, I would love to hear how you found the time for all of them.";
        const mid = (n) => `camille-sig-${String(n).padStart(4, "0")}`;
        const send = (body, signals, n) => as(`/api/intros/${yes.json.introId}/messages`, { method: "POST", body: { body, clientId: mid(n), ...(signals ? { signals } : {}) } });
        const signalOf = async (id) => (await waitFor(async () => (await sql("select signal from intro_message_signals where message_id = $1 and signal is not null", [id]))[0]?.signal))?.valueOf();
        const sentAt = Date.now();
        const m1 = await send(plain, typed, 1);
        check("signal: a message is delivered at once (201) — its signal arrives a moment later, never before it", m1.status === 201 && m1.json.message.signal === null && Date.now() - sentAt < 3000);
        check("signal: typed by hand and nothing odd in the text → HAND", (await signalOf(m1.json.message.id)) === "HAND");
        const m2 = await send(machine, pasted, 2);
        check("signal: the text reads as machine AND it arrived pasted → LIKELY_GENERATED (two independent signs)", (await signalOf(m2.json.message.id)) === "LIKELY_GENERATED");
        const m3 = await send(machine.replace("Hello!", "Hey!"), typed, 3);
        check("signal: the text reads as machine but was typed → only UNSURE", (await signalOf(m3.json.message.id)) === "UNSURE");
        const m4 = await send(doubtful, pasted, 4);
        check("signal: a doubtful text that was pasted → UNSURE, not an accusation", (await signalOf(m4.json.message.id)) === "UNSURE");
        const m5 = await send("Salut, ça va ?", pasted, 5);
        check("signal: under the minimum number of words → TOO_SHORT, whatever the rest says", (await signalOf(m5.json.message.id)) === "TOO_SHORT");
        const m6 = await send(plain.replace("Salut", "Coucou"), undefined, 6);
        check("signal: with no measure at all (another client) a text that does not read as machine is HAND, and the counters are stored as null", (await signalOf(m6.json.message.id)) === "HAND" && (await sql("select typed_ms from intro_message_signals where message_id = $1", [m6.json.message.id]))[0].typed_ms === null);
        const m7 = await send(doubtful.replace("tapestry", "tapestry"), undefined, 7);
        check("signal: with no measure, a doubtful text is UNSURE", (await signalOf(m7.json.message.id)) === "UNSURE");

        const seen = await runsOfStub();
        check("signal: each message was read once by Orazaka's message-authenticity Studio (run ids kept as proof), and the engine's report carried no score", seen.messageJudgements.length >= 6 && (await sql("select count(*)::int as n from intro_message_signals where engine_run_id is not null and signal is not null"))[0].n >= 6);
        const detail2 = await as(`/api/intros/${yes.json.introId}`);
        check("signal: the signal rides every message of the thread — both people read the same four words, and no number", detail2.json.intro.messages.every((m) => "signal" in m && [null, "HAND", "UNSURE", "LIKELY_GENERATED", "TOO_SHORT"].includes(m.signal)) && !/"(score|probability|confidence|detector)"/.test(JSON.stringify(detail2.json)));
        check("signal: the counters are five numbers per message, no keystroke and no text", (await sql("select column_name from information_schema.columns where table_name = 'intro_message_signals' order by 1")).map((r) => r.column_name).join() === "created_at,deletions,detector,engine_run_id,judged_at,message_id,paste_events,pasted_chars,rules_version,signal,typed_chars,typed_ms");
        check("signal: counters outside their bounds, or a field nobody asked for, are refused (400)", (await send(plain, { ...typed, typedMs: -1 }, 8)).status === 400 && (await send(plain, { ...typed, keystrokes: [1, 2] }, 9)).status === 400);

        // The engine out of reach: the message still goes; its signal is made from how it arrived alone.
        await control("down");
        const m10 = await send(plain.replace("Salut", "Allô"), typed, 10);
        check("signal: with the engine down the message is delivered all the same (201)", m10.status === 201);
        check("signal: …and its signal comes from how it was typed alone (HAND), never a block", (await signalOf(m10.json.message.id)) === "HAND");
        await control("up");
        check("signal: a signal is first-write-wins: a message judged once keeps its word", (await sql("select count(*)::int as n from intro_message_signals where signal is not null and judged_at is not null"))[0].n >= 8);
      }
      // ── Media messages: photo, video, voice message — private, within limits, never edited, judged before they are shown ────
      {
        const mia = await signUp("mia", { birthDate: "1990-02-02" });
        const noa = await signUp("noa", { birthDate: "1989-03-03" });
        const eve = await signUp("eve", { birthDate: "1988-04-04" });
        const [pa, pb] = mia.id < noa.id ? [mia.id, noa.id] : [noa.id, mia.id];
        const [{ id: roomId }] = await sql("insert into intros (account_a, account_b, state, expires_at) values ($1, $2, 'OPEN', now() + interval '7 days') returning id", [pa, pb]);
        const mk = (name, args) => {
          const out = path.join(os.tmpdir(), `yasakia-e2e-${run}-${name}`);
          execFileSync(ffmpegPath, ["-v", "error", ...args, "-y", out]);
          return fs.readFileSync(out);
        };
        const video = mk("clip.mp4", ["-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=15", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-metadata", "title=E2E-SECRET-TITLE", "-metadata", "location=+45.5017-073.5673/"]);
        const longVideo = mk("long.mp4", ["-f", "lavfi", "-i", "testsrc=duration=70:size=160x120:rate=5", "-c:v", "libx264", "-pix_fmt", "yuv420p"]);
        const voice = mk("voice.m4a", ["-f", "lavfi", "-i", "sine=frequency=330:duration=2", "-c:a", "aac", "-metadata", "artist=E2E-SECRET-ARTIST"]);
        const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 30, g: 120, b: 200 } } }).withExif({ IFD0: { Make: "E2E Phone" } }).jpeg().toBuffer();
        const as = (user) => (pathname, init = {}) => call(pathname, { ...init, token: user.token, ip: user.ip });
        const asMia = as(mia), asNoa = as(noa), asEve = as(eve);
        const room = `/api/intros/${roomId}`;
        const safety = (verdict, blockers = [], times = 1) => fetch(`${STUB}/__control/safety`, { method: "POST", body: JSON.stringify({ verdict, blockers, times }) });
        const start = (user, kind, contentType, bytes, durationMs) => as(user)(`${room}/media`, { method: "POST", body: { kind, contentType, bytes: bytes.length, ...(durationMs !== undefined ? { durationMs } : {}), clientId: crypto.randomUUID() } });
        const put = (started, bytes, contentType) => fetch(started.json.upload.url, { method: "PUT", headers: { "Content-Type": contentType }, body: bytes });
        const send = async (user, kind, contentType, bytes, durationMs) => {
          const started = await start(user, kind, contentType, bytes, durationMs);
          if (started.status !== 201) return { started };
          const uploaded = await put(started, bytes, contentType);
          const done = await as(user)(`${room}/media/${started.json.messageId}/complete`, { method: "PUT" });
          return { started, uploaded, done, id: started.json.messageId };
        };
        const seenBy = async (user) => (await as(user)(room)).json.intro.messages;
        const approved = (id) => waitFor(async () => (await sql("select status from intro_media where message_id = $1", [id]))[0]?.status === "APPROVED", 30000);
        const stored = (key) => fs.existsSync(path.join(STORAGE, key));

        // The limits are the rule set's — told at the start, measured again at the end.
        const detail0 = await asMia(room);
        check("media: the limits ride the thread (photo 10 MB, video 60 s / 50 MB, voice 2 min / 10 MB), read from the MEDIA rule set", detail0.json.intro.mediaLimits.photoMaxBytes === 10485760 && detail0.json.intro.mediaLimits.videoMaxSeconds === 60 && detail0.json.intro.mediaLimits.videoMaxBytes === 52428800 && detail0.json.intro.mediaLimits.audioMaxSeconds === 120 && detail0.json.intro.mediaLimits.audioMaxBytes === 10485760, detail0.json.intro.mediaLimits);
        check("media: a declared size beyond the limit is refused before any upload (413 MEDIA_TOO_LARGE, with the max)", (await as(mia)(`${room}/media`, { method: "POST", body: { kind: "PHOTO", contentType: "image/jpeg", bytes: 11 * 1024 * 1024, clientId: crypto.randomUUID() } })).json.code === "MEDIA_TOO_LARGE" && (await as(mia)(`${room}/media`, { method: "POST", body: { kind: "VIDEO", contentType: "video/mp4", bytes: 1000, durationMs: 61000, clientId: crypto.randomUUID() } })).json.code === "MEDIA_TOO_LONG");
        check("media: a type that is not a photo/video/sound is refused (415), and a visitor or a stranger gets 401/404", (await start(mia, "VIDEO", "application/pdf", Buffer.from("x"))).status === 415 && (await call(`${room}/media`, { method: "POST", body: {} })).status === 401 && (await asEve(`${room}/media`, { method: "POST", body: { kind: "PHOTO", contentType: "image/jpeg", bytes: 10, clientId: crypto.randomUUID() } })).status === 404);

        // A video that lies about its length: the measured length decides.
        const liar = await send(mia, "VIDEO", "video/mp4", longVideo, 1000);
        check("media: the file is measured — a 70-second video declared as 1 second is refused (413 MEDIA_TOO_LONG) and leaves nothing behind", liar.done.status === 413 && liar.done.json.code === "MEDIA_TOO_LONG" && (await sql("select count(*)::int as n from intro_messages where id = $1", [liar.id]))[0].n === 0);
        const wrong = await send(mia, "AUDIO", "audio/mp4", video, 3000);
        check("media: a video declared as a voice message is refused (422 MEDIA_WRONG_KIND), and a file that is no media at all too (422)", wrong.done.json.code === "MEDIA_WRONG_KIND" && (await send(mia, "VIDEO", "video/mp4", Buffer.from("this is not a video, only text ".repeat(20)), 3000)).done.status === 422);

        // The signed upload: the signature is the authorisation.
        const st = await start(mia, "PHOTO", "image/jpeg", photo);
        const forged = st.json.upload.url.replace(/signature=[^&]+/, "signature=AAAA");
        check("media: the upload URL is signed for one message and 300 seconds — a forged or reused signature is refused (403)", st.status === 201 && /\/api\/uploads\/messages\/[0-9a-f-]{36}\?expires=\d+&signature=/.test(st.json.upload.url) && (await fetch(forged, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: photo })).status === 403 && (await put(st, photo, "image/png")).status === 415);
        check("media: completing before the bytes arrive: 409 UPLOAD_MISSING", (await asMia(`${room}/media/${st.json.messageId}/complete`, { method: "PUT" })).json.code === "UPLOAD_MISSING");
        await put(st, photo, "image/jpeg");

        // A photo: stored clean, held until the safety check passed — the other person cannot see it before.
        const done1 = await asMia(`${room}/media/${st.json.messageId}/complete`, { method: "PUT" });
        const holdId = st.json.messageId;
        check("media: a photo is cleaned and stored, then waits for its safety check (PENDING) — the sender sees it, the other person does not", done1.status === 200 && ["PENDING", "APPROVED"].includes(done1.json.media.status) && (await seenBy(mia)).some((m) => m.id === holdId));
        check("media: …nothing of it exists for the other person while it waits (not in the thread, 404 on its URL)", done1.json.media.status !== "PENDING" || (!(await seenBy(noa)).some((m) => m.id === holdId) && (await asNoa(`${room}/media/${holdId}`)).status === 404));
        check("media: the safety check approved it through Orazaka (media-safety, a run id kept)", (await approved(holdId)) !== null && (await sql("select engine_run_id from intro_media where message_id = $1", [holdId]))[0].engine_run_id !== null && (await runsOfStub()).mediaSafety.length >= 1);
        // One review at a time per media (a lease): two loops judging the same photo spent a verdict the next media was owed.
        await sleep(6000);
        check("media: one safety run for that photo — a second loop does not judge it again while the first review is in flight", (await runsOfStub()).mediaSafety.length === 1, (await runsOfStub()).mediaSafety.length);
        const seenNoa = (await seenBy(noa)).find((m) => m.id === holdId);
        check("media: once approved the other person sees it, with no URL in the thread (the file comes through a signed URL)", seenNoa?.kind === "PHOTO" && seenNoa.media.status === "APPROVED" && !JSON.stringify(seenNoa).includes("messages/") && !/https?:/.test(JSON.stringify(seenNoa)));
        const url1 = await asNoa(`${room}/media/${holdId}`);
        const img = await fetch(url1.json.media.url);
        const imgBytes = Buffer.from(await img.arrayBuffer());
        check("media: a signed URL (300 s) serves the photo as it was stored — re-encoded, no EXIF/GPS left", url1.status === 200 && img.status === 200 && (await sharp(imgBytes).metadata()).exif === undefined && !imgBytes.includes(Buffer.from("E2E Phone")));
        check("media: …and an altered or expired signature is refused (403); a stranger gets 404", (await fetch(url1.json.media.url.replace(/expires=\d+/, "expires=1"))).status === 403 && (await asEve(`${room}/media/${holdId}`)).status === 404);

        // A video: metadata gone, a poster, three frames judged.
        const v = await send(mia, "VIDEO", "video/mp4", video, 3000);
        check("media: a short video is accepted (≤ 60 s, ≤ 50 MB)", v.done.status === 200 && (await approved(v.id)) !== null);
        const vUrl = await asNoa(`${room}/media/${v.id}`);
        const vBytes = Buffer.from(await (await fetch(vUrl.json.media.url)).arrayBuffer());
        check("media: its title and GPS tags are gone from the stored file; the other person gets a poster and the video", !vBytes.includes(Buffer.from("E2E-SECRET-TITLE")) && !vBytes.includes(Buffer.from("+45.5017")) && vBytes.length > 5000 && typeof vUrl.json.media.posterUrl === "string" && (await runsOfStub()).mediaSafety.some((r) => r.frames === 3 && !r.speech));

        // A voice message: a waveform, judged on its words.
        const a = await send(mia, "AUDIO", "audio/mp4", voice, 2000);
        check("media: a voice message is accepted, with its length and a 64-bar waveform", a.done.status === 200 && a.done.json.media.waveform?.length === 64 && a.done.json.media.waveform.every((x) => x >= 0 && x <= 100) && Math.abs(a.done.json.media.durationMs - 2000) < 500);
        check("media: …judged on its transcript (the engine was given the sound, no pictures)", (await approved(a.id)) !== null && (await runsOfStub()).mediaSafety.some((r) => r.frames === 0 && r.speech));
        const aBytes = Buffer.from(await (await fetch((await asNoa(`${room}/media/${a.id}`)).json.media.url)).arrayBuffer());
        check("media: its tags are gone too", !aBytes.includes(Buffer.from("E2E-SECRET-ARTIST")));

        // The safety check: refused, unreadable, engine down — and what each leaves.
        await safety("REJECTED", ["SEXUAL_CONTENT"]);
        const bad = await send(mia, "PHOTO", "image/jpeg", photo);
        await waitFor(async () => (await sql("select status from intro_media where message_id = $1", [bad.id]))[0]?.status === "REJECTED", 30000);
        const badKey = (await sql("select storage_key from intro_media where message_id = $1", [bad.id]))[0].storage_key;
        const badMine = (await seenBy(mia)).find((m) => m.id === bad.id);
        check("media: a refused photo is deleted (bytes gone), and only its sender learns why — in codes, never the engine's words", !stored(badKey) && badMine?.media.status === "REJECTED" && badMine.media.codes.join() === "SEXUAL_CONTENT");
        const rejSeen = (await seenBy(noa)).some((m) => m.id === bad.id), rejMia = await asMia(`${room}/media/${bad.id}`), rejNoa = await asNoa(`${room}/media/${bad.id}`);
        check("media: …the other person never saw it, and it has no URL (404) for anyone", !rejSeen && rejMia.status === 404 && rejNoa.status === 404, { rejSeen, mia: [rejMia.status, rejMia.json?.code], noa: [rejNoa.status, rejNoa.json?.code] });

        await safety("UNREADABLE");
        const held = await send(mia, "PHOTO", "image/jpeg", photo);
        await waitFor(async () => (await sql("select attempts from intro_media where message_id = $1", [held.id]))[0]?.attempts >= 1, 30000);
        const heldRow = (await sql("select status from intro_media where message_id = $1", [held.id]))[0];
        check("media: a check that cannot read is a HOLD, never an approval — still PENDING, invisible to the other person", heldRow.status === "PENDING" && !(await seenBy(noa)).some((m) => m.id === held.id));
        await sql("update intro_media set attempts = 99 where message_id = $1", [held.id]); // out of the loop: it waits for a person

        await control("down");
        const offline = await send(mia, "PHOTO", "image/jpeg", photo);
        await sleep(1500);
        check("media: with the engine down the photo is held (PENDING), not approved and not lost", offline.done.status === 200 && (await sql("select status from intro_media where message_id = $1", [offline.id]))[0].status === "PENDING" && !(await seenBy(noa)).some((m) => m.id === offline.id));
        await control("up");
        check("media: …and it is decided when the engine is back", (await approved(offline.id)) !== null);

        // Expiry follows the conversation.
        await sql("update intros set state = 'FADED', closed_at = now() where id = $1", [roomId]);
        const keyVideo = (await sql("select storage_key from intro_media where message_id = $1", [v.id]))[0].storage_key;
        check("media: once the conversation has faded nobody opens its media (404), whoever asks", (await asNoa(`${room}/media/${v.id}`)).status === 404 && (await asMia(`${room}/media/${v.id}`)).status === 404);
        check("media: …and the sweep deletes the bytes (GONE)", (await waitFor(async () => !stored(keyVideo) && (await sql("select status from intro_media where message_id = $1", [v.id]))[0].status === "GONE", 40000)) !== null);

        // Deleting an account takes the conversation's media with it.
        await sql("update intros set state = 'OPEN', closed_at = null where id = $1", [roomId]);
        const last = await send(mia, "PHOTO", "image/jpeg", photo);
        await approved(last.id);
        const keepKey = (await sql("select storage_key from intro_media where message_id = $1", [last.id]))[0].storage_key;
        check("media: (the last photo is approved and its bytes are in storage before the deletion)", stored(keepKey));
        const del = await as(noa)("/api/me", { method: "DELETE" });
        const keys = (await sql("select storage_keys from account_deletions where account_id = $1", [noa.id]))[0]?.storage_keys ?? [];
        check("media: deleting an account queues the media of its conversations for the purge (both people's files)", del.status === 200 && keys.includes(keepKey));
        check("media: …and the purge removes them from storage", (await waitFor(async () => !stored(keepKey), 40000)) !== null);
        check("media: no raw URL, storage key or score in the media answers", !/"storage_?key"|"posterKey"/i.test(JSON.stringify(answers.slice(-60))));
      }
      const cont = await as(`/api/intros/${yes.json.introId}/continue`, { method: "POST" });
      check("intros: « continue » alone waits for the other (still OPEN), and is said once", cont.json.state === "OPEN" && (await as(`/api/intros/${yes.json.introId}/continue`, { method: "POST" })).json.code === "ALREADY_CONTINUED" && (await as(`/api/intros/${yes.json.introId}`)).json.intro.continuedByMe === true);
      await sql("update intros set expires_at = now() - interval '1 minute' where id = $1", [yes.json.introId]);
      check("intros: past its days, nobody writes in it any more (409 INTRO_CLOSED)", (await as(`/api/intros/${yes.json.introId}/messages`, { method: "POST", body: { body: "Encore là ?", clientId: "camille-0003" } })).json.code === "INTRO_CLOSED");
      check("intros: no score, no similarity in any intro answer", !/"(score|similarity|affinity)"/.test(JSON.stringify([list.json, detail.json])));
    }
    await sql("update rule_sets set active = false where domain = 'MATCHING' and version = 2");
    await sql("update rule_sets set active = true where domain = 'MATCHING' and version = 1");
  }

  // The QA person's journey, as the console makes it (cookie session, same origin): sign in, talk, portrait — then a blank page again.
  {
    const qaEmail = "qa+user@yasakia.com";
    const qaPassword = env("QA_USER_PASSWORD", "");
    const asBrowser = async (pathname, { method = "GET", cookie, body } = {}) => {
      const res = await fetch(B + pathname, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method !== "GET" ? { Origin: B } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), "X-Forwarded-For": freshIp() }, body: body !== undefined ? JSON.stringify(body) : undefined });
      const text = await res.text();
      let json = {};
      try { json = JSON.parse(text); } catch {}
      return { status: res.status, json, headers: res.headers };
    };
    const login = await asBrowser("/api/auth/password", { method: "POST", body: { email: qaEmail, password: qaPassword } });
    const cookie = /(yasakia_session=[^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
    check("QA journey: the QA person signs in with the password the operator provisioned (dev has no e-mail, so no code)", login.status === 200 && !!cookie, login.status);
    const qa = (await sql("select id from accounts where email = $1", [qaEmail]))[0];
    for (const [i, line] of talk.entries()) {
      const r = await asBrowser("/api/agent/messages", { method: "POST", cookie, body: { content: line } });
      if (r.status !== 200) check(`QA journey: message ${i + 1} is answered`, false, r.json);
      await waitFor(async () => (await count("EXTRACT", qa.id)) >= i + 1);
    }
    const qaDone = await waitFor(async () => {
      const v = await asBrowser("/api/agent", { cookie });
      return v.json.agent?.state === "WAITING_POOL" ? v : null;
    });
    check("QA journey: the same journey works from the browser's cookie session — portrait written", !!qaDone && qaDone.json.agent.portrait?.self.length > 20 && Object.keys(qaDone.json.agent.evidence).length >= 3, qaDone?.json);
    check("QA journey: the owner is shown where the engine's runs can be found (one id per purpose, no score)", ["CHAT", "EXTRACT", "PORTRAIT", "EMBED"].every((p) => typeof qaDone?.json.agent.evidence[p] === "string"), qaDone?.json.agent?.evidence);

    // `npm run db:qa-reset`: a blank page again — and only for a QA address.
    const reset = spawnSync("npx", ["tsx", "packages/db/src/qa-reset.ts"], { cwd: ROOT, env: { ...process.env, DATABASE_URL: env("DATABASE_URL", ""), AUTH_QA_USER_EMAIL: qaEmail }, encoding: "utf8" });
    const after = await asBrowser("/api/agent", { cookie });
    check("QA journey: db:qa-reset gives the QA person's agent a blank page — no talk, nothing understood, no portrait, no vectors", reset.status === 0 && after.json.agent.state === "ONBOARDING" && after.json.agent.messages.length === 0 && after.json.agent.facets.length === 0 && after.json.agent.portrait === null && (await sql("select 1 from facet_embeddings where account_id = $1", [qa.id])).length === 0 && (await sql("select 1 from pairs_seen where account_id = $1", [qa.id])).length === 0, { out: reset.stdout, err: reset.stderr, agent: after.json.agent });
    const refused = spawnSync("npx", ["tsx", "packages/db/src/qa-reset.ts"], { cwd: ROOT, env: { ...process.env, DATABASE_URL: env("DATABASE_URL", ""), AUTH_QA_USER_EMAIL: `camille-${run}@example.test` }, encoding: "utf8" });
    check("QA journey: db:qa-reset refuses an address that is not a QA address", refused.status === 1 && /not a QA address/.test(refused.stderr), refused.stderr);
  }
}

// ── No raw media URL, no storage key, no score in any answer ───────────────────────────────────────
{
  const offenders = [];
  const walk = (value, where) => {
    if (typeof value === "string") {
      const isUrl = /^https?:\/\//.test(value);
      if (isUrl && /(\/api\/media\/|b-cdn\.net|storage\.bunnycdn\.com)/.test(value) && !(/[?&]token=/.test(value) && /[?&]expires=\d+/.test(value))) offenders.push(`${where}: unsigned ${value}`);
      if (isUrl && /storage\.bunnycdn\.com/.test(value)) offenders.push(`${where}: storage API host ${value}`);
      if (!isUrl && /^(photos|uploads)\/[0-9a-f-]{36}\//.test(value)) offenders.push(`${where}: storage key ${value}`);
    } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (/^(score|similarity)$/i.test(k)) offenders.push(`${where}.${k}: a score`);
        if (/storageKey|storage_key/.test(k)) offenders.push(`${where}.${k}: a storage key field`);
        walk(v, `${where}.${k}`);
      }
    }
  };
  for (const answer of answers) walk(answer.json, answer.path);
  check(`no raw media URL, storage key or score in any API answer (${answers.length} answers scanned)`, offenders.length === 0, offenders.slice(0, 5).join(" | "));
}

await db.end();
console.log(`\n${failures === 0 ? "✓" : "✗"} ${checks - failures}/${checks} checks passed`);
if (failures) process.exitCode = 1;
