#!/usr/bin/env node
/**
 * The console crawl (Dev preview `ui.themes-devices`, `admin.shell`): signs in once as a QA person (and, with --admin, as the QA
 * operator), walks every console page at phone, tablet and desktop widths, dark and light, English and French, and refuses
 *   - horizontal overflow (the page, or an element poking out of the viewport that nothing clips),
 *   - a JavaScript error or a failed request (5xx) on the page,
 *   - an error page («Something went wrong»), an empty main area.
 * With --shots <dir> it writes a screenshot of each stop (they go to Bunny `pr-assets/yasakia/dev-preview/`, never the repository).
 *
 *   AUTH_QA_USER_PASSWORD=… node scripts/check-console.mjs --base https://dev.yasakia.com [--email qa+user@yasakia.com] [--shots <dir>]
 *   AUTH_QA_ADMIN_PASSWORD=… node scripts/check-console.mjs --admin --base https://admin.yasakia.com [--forwarded-for 203.0.113.7]
 *
 * Passwords come from the environment, never a flag, and are never printed. Credentials are read by whoever runs it.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

export const WIDTHS = [390, 768, 1280];
export const THEMES = ["dark", "light"];
export const LOCALES = ["en", "fr"];
export const USER_PAGES = ["", "/talk", "/photos", "/batch", "/intros", "/account"];
export const ADMIN_PAGES = ["/admin", "/admin/users", "/admin/intros", "/admin/reports", "/admin/rules", "/admin/audit", "/admin/analytics", "/admin/health"];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

/** Runs in the page: what pokes out of the viewport and is not clipped by an ancestor. */
export function overflowInPage() {
  const vw = document.documentElement.clientWidth;
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(`${o.overflowX}`)) return true;
    }
    return false;
  };
  const out = [];
  if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
  /** The nearest ancestor that clips (hidden / clip, not a scroller): what pokes out of it is cut, not scrolled to. */
  const clipper = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (/(auto|scroll)/.test(o)) return null; // a scroller: what pokes out is scrolled to
      if (/(hidden|clip)/.test(o)) return p;
    }
    return null;
  };
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("[aria-hidden='true']")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.position === "fixed" || style.visibility === "hidden") continue;
    if (out.length >= 4) break;
    const label = () => `<${el.tagName.toLowerCase()}> "${(el.textContent ?? "").trim().slice(0, 40)}"`;
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) {
      out.push(`${label()} ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
      continue;
    }
    // Text cut by a clipping ancestor (not an ellipsis on purpose: that element clips itself).
    const c = clipper(el);
    if (c && style.textOverflow !== "ellipsis") {
      // The text itself, not the box (a block is as wide as its container): the rectangles of its words.
      const range = document.createRange();
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        range.selectNodeContents(n);
        const cr = c.getBoundingClientRect();
        for (const t of range.getClientRects()) {
          if (t.width > 0 && ((t.right > cr.right + 1 && t.left < cr.right - 2) || (t.left < cr.left - 1 && t.right > cr.left + 2))) {
            out.push(`${label()} is cut by its container (${Math.round(t.right)} > ${Math.round(cr.right)})`);
            break;
          }
        }
      }
    }
  }
  const text = document.body.innerText;
  if (/Something went wrong|Une erreur est survenue|Quelque chose s’est mal passé/i.test(text)) out.push("an error page");
  const main = document.querySelector("main") ?? document.body;
  if (main.innerText.trim().length < 20) out.push("an empty main area");
  return out;
}

export async function crawl({ base, email, password, admin, forwardedFor, shots }) {
  const browser = await chromium.launch();
  const problems = [];
  const extraHTTPHeaders = forwardedFor ? { "X-Forwarded-For": forwardedFor } : undefined;
  const signIn = await browser.newContext({ extraHTTPHeaders });
  // The password sign-in is an API call (the form of a cold development server may not be hydrated when it is clicked): the session cookie
  // lands in this context, whose state every stop reuses.
  const reply = await signIn.request.post(`${base}/api/auth/password`, { data: { email, password }, headers: { origin: base }, timeout: 180_000 });
  if (!reply.ok()) throw new Error(`sign-in answered ${reply.status()}`);
  const state = await signIn.storageState();
  await signIn.close();
  const pages = admin ? ADMIN_PAGES : USER_PAGES;
  if (shots) mkdirSync(shots, { recursive: true });
  let stops = 0;
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ storageState: state, colorScheme: theme, viewport: { width, height: width < 600 ? 844 : 900 }, extraHTTPHeaders });
      await context.addInitScript((t) => {
        try {
          localStorage.setItem("kz-theme", t);
        } catch {
          /* storage can be unavailable */
        }
      }, theme);
      const page = await context.newPage();
      page.setDefaultTimeout(180_000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(`script error: ${e.message.slice(0, 120)}`));
      page.on("response", (r) => {
        if (r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
      });
      for (const locale of LOCALES) {
        for (const path of pages) {
          errors.length = 0;
          const url = `${base}/app/${locale}${path}`;
          await page.goto(url, { waitUntil: "load" });
          await page.waitForTimeout(1200);
          const found = [...(await page.evaluate(overflowInPage)), ...errors];
          stops += 1;
          if (shots) await page.screenshot({ path: join(shots, `${admin ? "admin" : "app"}-${locale}${path.replace(/\//g, "-") || "-home"}-${theme}-${width}.png`) });
          for (const f of found) problems.push(`${url} [${theme} ${width}px] ${f}`);
        }
      }
      await context.close();
    }
  }
  await browser.close();
  return { problems, stops };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const admin = has("admin");
  const password = admin ? process.env.AUTH_QA_ADMIN_PASSWORD : process.env.AUTH_QA_USER_PASSWORD;
  if (!password) {
    console.error(`${admin ? "AUTH_QA_ADMIN_PASSWORD" : "AUTH_QA_USER_PASSWORD"} is not set (read it with the secret tool; never type it on a command line).`);
    process.exit(2);
  }
  const email = arg("email", process.env.AUTH_QA_USER_EMAIL ?? (admin ? "qa+admin@yasakia.com" : "qa+user@yasakia.com"));
  const { problems, stops } = await crawl({ base: String(arg("base", "http://localhost:3000")).replace(/\/$/, ""), email, password, admin, forwardedFor: arg("forwarded-for", undefined), shots: arg("shots", undefined) });
  if (problems.length) {
    console.error(`✗ ${problems.length} problem(s) over ${stops} stops:\n${problems.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`✓ ${stops} stops (${admin ? "operator console" : "console"}: ${WIDTHS.join("/")} px × dark/light × en/fr): no overflow, no error`);
}
