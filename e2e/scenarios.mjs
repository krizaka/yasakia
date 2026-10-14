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
import fs from "node:fs";
import path from "node:path";

import pg from "pg";
import sharp from "sharp";

import { readEnv, ROOT } from "../scripts/lib.mjs";

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
  check("one named LISTEN connection, the pool named and within DATABASE_MAX_CONNECTIONS (5)", listen.n === 1 && web.n >= 1 && web.n <= 5, { listen: listen.n, web: web.n });
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
      + (select count(*) from account_exports where account_id = $1) as n`,
    [ada.id],
  );
  check("…every row of hers is gone (profile, photos, agent, blocks, batches, intros, exports)", Number(leftovers[0].n) === 0, leftovers[0]);
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
  const refusedLog = await web("/api/admin/audit?action=auth.sign_in_refused&size=5", { cookie: adminIn.cookie, ip: ADMIN_IP_HEADER });
  check("audit: refused sign-ins are logged too", refusedLog.json.rows?.length > 0);
  check("audit: the operator token reads the same API (no account)", (await call("/api/admin/users?size=1", { token: ADMIN_TOKEN, ip: ADMIN_IP })).status === 200);

  // The console's pages.
  const page = (p, cookie, ip) => web(p, { cookie, ip });
  check("pages: the sign-in page is served (200) and not indexed", (await page("/en/sign-in")).status === 200 && (await page("/en/sign-in")).text.includes("noindex"));
  check("pages: the home without a session goes to sign-in", (await page("/en")).status === 307 && (await page("/en")).headers.get("location")?.endsWith("/en/sign-in"));
  check("pages: the home, the account render for a person", (await page("/en", user.cookie)).status === 200 && (await page("/fr/account", user.cookie)).status === 200);
  check("pages: the administration console is a 404 for a person", (await page("/en/admin/users", user.cookie, ADMIN_IP_HEADER)).status === 404 && (await page("/en/admin/audit", user.cookie, ADMIN_IP_HEADER)).status === 404);
  check("pages: ...and for an administrator on a wrong address", (await page("/en/admin/users", adminIn.cookie, "198.51.100.200")).status === 404);
  check("pages: ...and renders for an administrator on the allowed address", (await page("/en/admin/users", adminIn.cookie, ADMIN_IP_HEADER)).status === 200 && (await page(`/fr/admin/users/${someone.id}`, adminIn.cookie, ADMIN_IP_HEADER)).status === 200);

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
