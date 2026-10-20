#!/usr/bin/env node
/**
 * `node scripts/record-take.mjs` — Camille's real journey on a real deployment (dev.yasakia.com), as a PHONE take captured
 * with the Chrome DevTools Protocol screencast (frames with their own timestamps, resampled to a constant 30 fps — never the
 * 12–25 fps of a stock recorder), and the evidence of the run.
 *
 *   photos (4 fictitious-adult photos: her portrait twice, framed differently, and two scenes) → the photo check of Orazaka
 *   → the agent conversation → the first batch → yes → in the introduction: a message typed by hand (the authenticity signal),
 *   a photo and a voice message (safety check via Orazaka, voice transcribed by Orazaka's speech).
 *
 *   AUTH_QA_USER_EMAIL=… AUTH_QA_USER_PASSWORD=… node scripts/record-take.mjs --base https://dev.yasakia.com --out <dir> \
 *       --assets <dir with portrait-1.png portrait-2.png scene-1.png scene-2.png intro-photo.png voice.wav> [--locale fr] [--theme dark|light]
 *
 * The password is read from the environment and never printed; a recording never shows the account's e-mail (the persona's
 * name replaces it on screen). The person is a fictional adult (generated portraits, a synthesised voice): nobody real.
 * Files: <out>/take.mp4 (30 fps), <out>/frames.json (the timing), <out>/evidence.json (steps with their seconds in the take, run ids).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
};
const base = String(flag("base", "http://localhost:3000")).replace(/\/$/, "");
const locale = flag("locale", "fr");
const theme = flag("theme", "dark");
const out = path.resolve(String(flag("out", "take-out")));
const assets = path.resolve(String(flag("assets", "assets")));
const FPS = 30;
const [width, height] = [390, 844];
const email = process.env.AUTH_QA_USER_EMAIL ?? "qa+user@yasakia.com";
const password = process.env.AUTH_QA_USER_PASSWORD;
if (!password) {
  console.error("AUTH_QA_USER_PASSWORD is not set (read it with the secret tool; never type it on a command line).");
  process.exit(2);
}

const SAYS = {
  fr: [
    "Salut ! Moi c’est Camille, je suis une femme et je vis à Montréal.",
    "Je cherche un homme entre 32 et 42 ans, pas trop loin, 25 km max, pour une relation sérieuse.",
    "Mon samedi parfait : le marché Jean-Talon le matin, une randonnée sur le mont Royal, puis un souper à la maison avec des amis. Ce qui compte pour moi : la curiosité, la gentillesse et l’honnêteté.",
    "J’adore les jeux de mots nuls. Je ne supporte pas les gens toujours sur leur téléphone.",
    "J’espère rencontrer quelqu’un de curieux, qui lit, qui aime cuisiner et qui sait écouter.",
  ],
  en: [
    "Hi! I’m Camille, I’m a woman and I live in Montréal.",
    "I’m looking for a man between 32 and 42, not too far, 25 km at most, for a serious relationship.",
    "My perfect Saturday: Jean-Talon market in the morning, a hike on Mont Royal, then dinner at home with friends. What matters to me: curiosity, kindness and honesty.",
    "I love terrible puns. I can’t stand people who are always on their phone.",
    "I hope to meet someone curious, who reads, who loves cooking and who knows how to listen.",
  ],
}[locale];

/** The words of the screens (messages/*.json of apps/web). */
const UI = {
  fr: {
    photosReady: "Tes photos sont prêtes",
    portrait: "Ton portrait",
    start: "Chercher mon premier lot",
    why: "Pourquoi vous deux",
    more: "Dis-m’en plus",
    yes: "Intéressé·e",
    pass: "Je passe",
    debrief: "Envoyer le débrief",
    chips: ["En partie", "Les valeurs", "Plus près de chez moi"],
    note: "Elle aime cuisiner et les jeux de mots, c’est un bon début.",
    first: "Salut ! J’ai vu que tu aimes cuisiner. C’est quoi ton plat de réconfort ?",
    signals: ["Écrit à la main", "Incertain", "Probablement généré", "Trop court pour juger"],
    send: "Envoyer",
    photoButton: "Photo",
    voiceButton: "Vocal",
    approved: "Vérification de sécurité",
  },
  en: {
    photosReady: "Your photos are ready",
    portrait: "Your portrait",
    start: "Look for my first batch",
    why: "Why you two",
    more: "Tell me more",
    yes: "Interested",
    pass: "Pass",
    debrief: "Send the debrief",
    chips: ["Partly", "Values", "Closer to me"],
    note: "She likes cooking and puns, a good start.",
    first: "Hi! I saw you like to cook. What is your comfort dish?",
    signals: ["Written by hand", "Uncertain", "Probably generated", "Too short to judge"],
    send: "Send",
    photoButton: "Photo",
    voiceButton: "Voice",
    approved: "Safety check",
  },
}[locale];

fs.mkdirSync(out, { recursive: true });
const framesDir = path.join(out, "frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

const evidence = { base, locale, theme, startedAt: new Date().toISOString(), runs: [], steps: [], viewport: `${width}x${height}`, fps: FPS };
let t0 = 0; // wall-clock ms of the first frame
const step = (name, extra = {}) => {
  const at = t0 ? (Date.now() - t0) / 1000 : 0;
  evidence.steps.push({ name, at: Number(at.toFixed(2)), ...extra });
  console.log(`▸ ${name} (${at.toFixed(1)} s)`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: theme,
  locale: locale === "fr" ? "fr-CA" : "en-CA",
});
const page = await context.newPage();
page.setDefaultTimeout(120_000);
await page.addInitScript((t) => {
  try {
    localStorage.setItem("kz-theme", t);
  } catch {
    /* storage can be unavailable */
  }
}, theme);
// A recording never shows an account's e-mail: the persona's name takes its place on screen.
await page.addInitScript(({ hidden, shown }) => {
  const mask = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.includes(hidden)) n.nodeValue = n.nodeValue.split(hidden).join(shown);
  };
  new MutationObserver(() => mask(document.body)).observe(document, { childList: true, subtree: true, characterData: true });
  document.addEventListener("DOMContentLoaded", () => mask(document.body));
}, { hidden: email, shown: "Camille" });

// ── CDP screencast: every frame with its own timestamp ───────────────────────────────────────────
const cdp = await context.newCDPSession(page);
const frames = []; // { file, t } t in seconds (the browser's monotonic clock)
let n = 0;
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = `${String(n++).padStart(6, "0")}.jpg`;
  fs.writeFileSync(path.join(framesDir, file), Buffer.from(data, "base64"));
  if (!t0) t0 = Date.now();
  frames.push({ file, t: metadata.timestamp });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: width * 2, maxHeight: height * 2, everyNthFrame: 1 });

// The ids of the engine's runs, as the API hands them back.
page.on("response", async (res) => {
  const url = res.url();
  if (url.endsWith("/api/agent/messages") && res.request().method() === "POST" && res.ok()) {
    const body = await res.json().catch(() => null);
    if (body?.message) evidence.runs.push({ kind: "agent-reply", reply: body.message.id });
  }
});

const tick = (ms) => page.waitForTimeout(ms);
const type = async (locator, text, delay = 24) => {
  await locator.click();
  await locator.pressSequentially(text, { delay });
};

// ── sign in ─────────────────────────────────────────────────────────────────────────────────────
step("sign in");
await page.goto(`${base}/app/${locale}/sign-in`);
await page.locator('input[name="email"]').fill(email);
await page.locator('input[name="password"]').fill(password);
await tick(600);
await Promise.all([page.waitForURL(new RegExp(`/app/${locale}/?$`)), page.locator('form button[type="submit"]').click()]);
await tick(1500);

// ── 1. the photos: four, two with her face — checked by Orazaka ────────────────────────────────
step("open the photos");
await page.goto(`${base}/app/${locale}/photos`);
await page.getByTestId("photo-input").waitFor({ state: "attached" });
await tick(1500);
step("add the photos");
const photoFiles = ["portrait-1.png", "scene-1.png", "portrait-2.png", "scene-2.png"].map((f) => path.join(assets, f));
for (const file of photoFiles) {
  await page.getByTestId("photo-input").setInputFiles(file);
  await tick(4200);
}
step("photos added");
await page.getByText(UI.photosReady, { exact: false }).first().waitFor({ timeout: 240_000 });
step("photo check passed");
await tick(2800);
const photoState = await page.evaluate(async () => (await (await fetch("/api/me/photos", { credentials: "same-origin" })).json()));
evidence.photos = { state: photoState?.check?.state ?? photoState?.state ?? null, counts: photoState?.check?.counts ?? photoState?.counts ?? null };

// ── 2. the conversation ─────────────────────────────────────────────────────────────────────────
step("open the conversation");
await page.goto(`${base}/app/${locale}/talk`);
const composer = page.locator("textarea");
await composer.waitFor();
await tick(1200);
let spoken = 0;
for (const line of SAYS) {
  await type(composer, line, 18);
  await tick(400);
  const answered = page.waitForResponse((r) => r.url().endsWith("/api/agent/messages") && r.request().method() === "POST", { timeout: 120_000 });
  await composer.press("Enter");
  spoken += 1;
  step(`message ${spoken} sent`);
  const reply = await answered;
  if (!reply.ok()) throw new Error(`the agent answered ${reply.status()}`);
  await page.getByText((await reply.json()).message.content.slice(0, 40), { exact: false }).first().waitFor();
  await tick(2200);
}
step("wait for the portrait");
await page.getByText(UI.portrait, { exact: true }).waitFor({ timeout: 120_000 });
step("portrait written");
await tick(2500);

// ── 3. the first batch ──────────────────────────────────────────────────────────────────────────
step("open the first batch");
await page.goto(`${base}/app/${locale}/batch`);
await tick(1500);
const asked = page.waitForResponse((r) => r.url().endsWith("/api/batches") && r.request().method() === "POST", { timeout: 180_000 });
await page.getByRole("button", { name: UI.start }).click();
const response = await asked;
const batch = { status: response.status(), ...(await response.json()) };
evidence.batchRuns = batch.batch?.runs ?? [];
evidence.batchStatus = batch.status;
step(`batch: HTTP ${batch.status}`);
if (!response.ok()) throw new Error(`the batch answered ${batch.status}`);
await page.getByText(UI.why, { exact: true }).first().waitFor({ timeout: 60_000 });
await tick(2500);
step("batch shown");
await page.mouse.wheel(0, 650);
await tick(1800);

step("answer the batch");
await page.mouse.wheel(0, -2000);
await page.getByRole("button", { name: UI.more }).first().click();
await tick(2500);
const yes = page.waitForResponse((r) => r.url().endsWith("/decision") && r.request().method() === "POST", { timeout: 120_000 });
await page.getByRole("button", { name: UI.yes }).first().click();
const said = await (await yes).json();
evidence.introId = said.introId ?? null;
step(`said yes: intro ${said.introId ? "opened" : "not opened"}`);
await tick(2000);
while ((await page.getByRole("button", { name: UI.pass }).count()) > 0) {
  const passed = page.waitForResponse((r) => r.url().endsWith("/decision") && r.request().method() === "POST");
  await page.getByRole("button", { name: UI.pass }).first().click();
  await passed;
  await tick(800);
}
await page.mouse.wheel(0, -2000);
await page.getByRole("button", { name: UI.debrief }).waitFor({ timeout: 30_000 });
for (const chip of UI.chips) await page.getByRole("radio", { name: chip, exact: true }).click();
await page.locator("textarea").first().pressSequentially(UI.note, { delay: 18 });
const debriefed = page.waitForResponse((r) => r.url().endsWith("/debrief") && r.request().method() === "POST");
await page.getByRole("button", { name: UI.debrief }).click();
evidence.debriefStatus = (await debriefed).status();
step(`debrief sent: HTTP ${evidence.debriefStatus}`);
await tick(2000);

// ── 4. the introduction: her own words, the signal, a photo, a voice message ───────────────────
if (!evidence.introId) throw new Error("no introduction opened");
step("open the introduction");
await page.goto(`${base}/app/${locale}/intros/${evidence.introId}`);
const box = page.locator("textarea");
await box.waitFor();
await tick(2000);
await type(box, UI.first, 115); // a hand types, it does not paste: the signal reads how the message arrived
const sentText = page.waitForResponse((r) => r.url().endsWith("/messages") && r.request().method() === "POST");
await box.press("Enter");
evidence.introMessageStatus = (await sentText).status();
step(`her own message sent: HTTP ${evidence.introMessageStatus}`);
await page.getByText(new RegExp(`^(${UI.signals.join("|")})$`, "i")).first().waitFor({ timeout: 120_000 }).catch(() => undefined);
step("authenticity signal shown");
await tick(3000);

step("send a photo");
await page.getByRole("button", { name: UI.photoButton, exact: true }).click().catch(() => undefined);
await page.getByTestId("media-photo").setInputFiles(path.join(assets, "intro-photo.png"));
await tick(2500);
const mediaCalls = [];
page.on("response", (r) => {
  if (/\/media\/[^/]+\/complete$/.test(r.url()) || (/\/media$/.test(r.url()) && r.request().method() === "POST")) mediaCalls.push(r.status());
});
await page.getByRole("button", { name: UI.send, exact: true }).filter({ hasText: UI.send }).click();
await tick(3000);
step("photo sent");
// The photo is held until Orazaka's safety check has looked at it: the page then shows it to both.
await page.waitForFunction(() => !/Safety check…|Vérification de sécurité…/i.test(document.body.innerText), null, { timeout: 150_000 }).catch(() => undefined);
await tick(2500);
step("photo approved");

step("send a voice message");
await page.getByTestId("media-audio").setInputFiles(path.join(assets, "voice.wav"));
await tick(3000);
await page.getByRole("button", { name: UI.send, exact: true }).filter({ hasText: UI.send }).click();
await tick(5000);
step("voice message sent");
evidence.mediaCalls = mediaCalls;
await page.waitForFunction(() => !/Safety check…|Vérification de sécurité…/i.test(document.body.innerText), null, { timeout: Number(flag("voice-wait", 90)) * 1000 }).catch(() => undefined);
step("media reviewed");
await tick(3500);

const agent = await page.evaluate(async () => (await (await fetch("/api/agent", { credentials: "same-origin" })).json()).agent);
evidence.state = agent?.state;
evidence.engineRuns = agent?.evidence ?? {};
evidence.finishedAt = new Date().toISOString();
const introView = await page.evaluate(async (id) => (await fetch(`/api/intros/${id}`, { credentials: "same-origin" })).json(), evidence.introId).catch(() => null);
evidence.introMessages = introView?.intro?.messages?.map((m) => ({ signal: m.authenticity ?? null, media: m.media?.status ?? null, kind: m.media?.kind ?? null })) ?? null;

await cdp.send("Page.stopScreencast");
await context.close();
await browser.close();

// ── a constant 30 fps from the timestamped frames (each frame holds until the next) ─────────────
fs.writeFileSync(path.join(out, "frames.json"), JSON.stringify(frames));
const list = [];
frames.forEach((f, i) => {
  const next = frames[i + 1];
  const d = next ? Math.max(next.t - f.t, 0.001) : 1 / FPS;
  list.push(`file '${path.join(framesDir, f.file)}'`, `duration ${d.toFixed(5)}`);
});
list.push(`file '${path.join(framesDir, frames.at(-1).file)}'`);
fs.writeFileSync(path.join(out, "frames.txt"), `${list.join("\n")}\n`);
execFileSync(ffmpegPath, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", path.join(out, "frames.txt"), "-vf", `fps=${FPS},scale=${width}:${height}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-movflags", "+faststart", path.join(out, "take.mp4")], { stdio: "inherit" });
fs.writeFileSync(path.join(out, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
const seconds = (frames.at(-1).t - frames[0].t).toFixed(1);
console.log(`✓ ${frames.length} frames over ${seconds} s (${(frames.length / Number(seconds)).toFixed(1)} captured/s, resampled to ${FPS} fps) — ${path.join(out, "take.mp4")}`);
