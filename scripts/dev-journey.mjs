#!/usr/bin/env node
/**
 * `npm run dev:journey` — walks the core journey in a real browser, as the QA person, on a real deployment (dev.yasakia.com)
 * or a local server wired to the real engine: sign in, talk to the agent until it has written the portrait (and, with
 * `--through batch`, open the first batch). It records a video of the run, takes the key screens, and writes
 * `evidence.json` — the engine run ids (the lines in Orazaka's logs) that prove the run was real.
 *
 *   AUTH_QA_USER_EMAIL=… AUTH_QA_USER_PASSWORD=… node scripts/dev-journey.mjs --base https://dev.yasakia.com --out <dir>
 *       [--locale fr|en] [--theme dark|light] [--viewport 1280x720|390x844] [--through talk|batch] [--no-video] [--shots]
 *
 * The password is read from the environment and never printed. The person is the QA account, whose agent starts from a
 * blank page (`npm run db:qa-reset`, run by whoever owns the database, before a recording).
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
};
const base = String(flag("base", "http://localhost:3000")).replace(/\/$/, "");
const locale = flag("locale", "fr");
const theme = flag("theme", "dark");
const [width, height] = String(flag("viewport", "1280x720")).split("x").map(Number);
const through = flag("through", "talk");
const out = path.resolve(String(flag("out", "journey-out")));
const wantVideo = flag("no-video", false) !== true;
const wantShots = flag("shots", false) === true;
const email = process.env.AUTH_QA_USER_EMAIL ?? "qa+user@yasakia.com";
const password = process.env.AUTH_QA_USER_PASSWORD;
if (!password) {
  console.error("AUTH_QA_USER_PASSWORD is not set (read it with the secret tool; never type it on a command line).");
  process.exit(2);
}

/** What Camille — a fictional adult, the QA person's persona — says. The agent answers each; nothing is scripted on its side. */
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

fs.mkdirSync(out, { recursive: true });
const evidence = { base, locale, theme, startedAt: new Date().toISOString(), runs: [], steps: [] };
const step = (name, extra = {}) => {
  evidence.steps.push({ name, at: new Date().toISOString(), ...extra });
  console.log(`▸ ${name}`);
};
const shot = async (page, name) => {
  if (wantShots) await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false });
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height },
  colorScheme: theme,
  locale: locale === "fr" ? "fr-CA" : "en-CA",
  ...(wantVideo ? { recordVideo: { dir: out, size: { width, height } } } : {}),
});
const page = await context.newPage();
page.setDefaultTimeout(90_000);
await page.addInitScript((t) => {
  try {
    localStorage.setItem("kz-theme", t);
  } catch {
    /* storage can be unavailable */
  }
}, theme);
// The conversation ids of the replies, as the API hands them back (the lines in Orazaka's logs).
page.on("response", async (res) => {
  if (res.url().endsWith("/api/agent/messages") && res.request().method() === "POST" && res.ok()) {
    const body = await res.json().catch(() => null);
    if (body?.message) evidence.runs.push({ at: new Date().toISOString(), reply: body.message.id, status: res.status() });
  }
});

step("sign in as the QA person");
await page.goto(`${base}/app/${locale}/sign-in`);
await page.locator('input[name="email"]').fill(email);
await page.locator('input[name="password"]').fill(password);
await shot(page, "01-sign-in");
await Promise.all([page.waitForURL(new RegExp(`/app/${locale}/?$`)), page.locator('form button[type="submit"]').click()]);
await shot(page, "02-home");

step("open the conversation");
await page.goto(`${base}/app/${locale}/talk`);
const composer = page.locator("textarea");
await composer.waitFor();
await page.waitForTimeout(1200);

// The agent opens by itself only after a first word: the person speaks first.
let spoken = 0;
for (const line of SAYS) {
  await composer.click();
  await composer.pressSequentially(line, { delay: 22 });
  await page.waitForTimeout(500);
  const answered = page.waitForResponse((r) => r.url().endsWith("/api/agent/messages") && r.request().method() === "POST", { timeout: 120_000 });
  await composer.press("Enter");
  spoken += 1;
  step(`message ${spoken} sent`);
  // The reply is the answer of that call; the page then shows it, and the understanding follows in the background.
  const reply = await answered;
  if (!reply.ok()) throw new Error(`the agent answered ${reply.status()}`);
  await page.getByText((await reply.json()).message.content.slice(0, 40), { exact: false }).first().waitFor();
  await page.waitForTimeout(2500);
  if (spoken === 1) await shot(page, "03-first-answer");
  if (spoken === 3) await shot(page, "04-understanding");
}

step("wait for the portrait");
await page.getByText(locale === "fr" ? "Ton portrait" : "Your portrait", { exact: true }).waitFor({ timeout: 120_000 });
await page.waitForTimeout(2500);
await shot(page, "05-portrait");

let batch = null;
if (through === "batch") {
  step("open the first batch");
  await page.goto(`${base}/app/${locale}/batch`);
  await shot(page, "06-batch-ready");
  const asked = page.waitForResponse((r) => r.url().endsWith("/api/batches") && r.request().method() === "POST", { timeout: 180_000 });
  await page.getByRole("button", { name: locale === "fr" ? "Chercher mon premier lot" : "Look for my first batch" }).click();
  const response = await asked;
  batch = { status: response.status(), ...(await response.json()) };
  evidence.batchRuns = batch.batch?.runs ?? [];
  evidence.batchStatus = batch.status;
  step(`batch: HTTP ${batch.status}`, { runs: evidence.batchRuns });
  if (response.ok()) {
    await page.getByText(locale === "fr" ? "Pourquoi vous deux" : "Why you two", { exact: true }).first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2500);
    await shot(page, "07-batch");
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1500);
    await shot(page, "08-batch-reasons");
    evidence.batchPeople = await page.locator("h2, h3").allTextContents();
  }
}

const agent = await page.evaluate(async () => (await (await fetch("/api/agent", { credentials: "same-origin" })).json()).agent);
evidence.state = agent?.state;
evidence.engineRuns = agent?.evidence ?? {};
evidence.messages = agent?.messages?.length;
evidence.facets = agent?.facets?.map((f) => f.key);
evidence.finishedAt = new Date().toISOString();

await context.close();
const video = wantVideo ? fs.readdirSync(out).find((f) => f.endsWith(".webm")) : null;
if (video) fs.renameSync(path.join(out, video), path.join(out, "journey.webm"));
await browser.close();
fs.writeFileSync(path.join(out, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`✓ ${evidence.state} — ${evidence.messages} messages, facets: ${evidence.facets?.join(", ")} — evidence in ${path.join(out, "evidence.json")}`);
