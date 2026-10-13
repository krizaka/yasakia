import fs from "node:fs";
import path from "node:path";

import { appUrl, ConfigurationError, isProduction } from "./env";
import { type MailTemplateId, type MailVars, renderMailTemplate } from "./mail-templates";

/**
 * Transactional e-mail through `MAIL_PROVIDER=mailgun` — Mailgun's HTTP API (`MAIL_API_KEY`, `MAIL_DOMAIN`, `MAIL_API_URL` for the EU
 * region, `MAIL_FROM`). Every message is a template (`sendTemplate`, mail-templates/): no body written in code.
 *
 * `MAIL_DELIVERY` decides what leaves:
 * - production: always delivered — and **fail-closed**: without Mailgun, a sign-in code cannot be sent, so the request
 *   answers 503 (never a code in a log);
 * - `on` (any environment): delivered through Mailgun;
 * - `file`: written as JSON to `MAIL_OUTBOX_DIR` (default `.mail-outbox/` at the repository root) — the end-to-end
 *   scenarios read the codes there; refused in production;
 * - otherwise (`log`, the development default): written to the server log.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  template: MailTemplateId;
}

export type MailDelivery = "mailgun" | "file" | "log";

export function mailDelivery(env: NodeJS.ProcessEnv = process.env): MailDelivery {
  if (isProduction(env)) return "mailgun";
  const mode = env.MAIL_DELIVERY?.trim().toLowerCase();
  if (mode === "on") return "mailgun";
  if (mode === "file") return "file";
  return "log";
}

export function outboxDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MAIL_OUTBOX_DIR) return path.resolve(env.MAIL_OUTBOX_DIR);
  const cwd = process.cwd();
  return cwd.endsWith(`${path.sep}apps${path.sep}web`) ? path.resolve(cwd, "../../.mail-outbox") : path.join(cwd, ".mail-outbox");
}

const fromAddress = (env: NodeJS.ProcessEnv) => env.MAIL_FROM?.trim() || `Yazakia <no-reply@${env.MAIL_DOMAIN?.trim() || "mg.yazakia.com"}>`;

/** Sends one message. Throws a ConfigurationError when Mailgun is required and missing; resolves false when refused. */
export async function sendMail(mail: Mail, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const delivery = mailDelivery(env);
  if (delivery === "log") {
    console.info(`mail (not delivered — MAIL_DELIVERY=on to send) to ${mail.to}: ${mail.subject}\n${mail.text}`);
    return true;
  }
  if (delivery === "file") {
    const dir = outboxDir(env);
    await fs.promises.mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    await fs.promises.writeFile(path.join(dir, name), JSON.stringify({ ...mail, at: new Date().toISOString() }, null, 2));
    return true;
  }
  if (env.MAIL_PROVIDER?.trim().toLowerCase() !== "mailgun") throw new ConfigurationError("MAIL_PROVIDER", "must be mailgun to send e-mail");
  const key = env.MAIL_API_KEY?.trim();
  const domain = env.MAIL_DOMAIN?.trim();
  if (!key || !domain) throw new ConfigurationError("MAIL_API_KEY and MAIL_DOMAIN", "are required to send e-mail");
  // https://documentation.mailgun.com — POST /v3/{domain}/messages, Basic auth `api:<key>`, form fields.
  const form = new FormData();
  form.append("from", fromAddress(env));
  form.append("to", mail.to);
  form.append("subject", mail.subject);
  form.append("text", mail.text);
  form.append("html", mail.html);
  form.append("o:tag", mail.template);
  const base = (env.MAIL_API_URL?.trim() || "https://api.mailgun.net").replace(/\/+$/, "");
  try {
    const res = await fetchImpl(`${base}/v3/${encodeURIComponent(domain)}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`api:${key}`).toString("base64")}` },
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error(`mail: mailgun refused (${res.status}) ${(await res.text()).slice(0, 300)}`);
    return res.ok;
  } catch (error) {
    console.error("mail: mailgun unreachable", error);
    return false;
  }
}

/** Renders a template in the recipient's language and sends it. */
export async function sendTemplate<Id extends MailTemplateId>(id: Id, mail: { to: string; locale?: string; vars: MailVars<Id> }, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const rendered = renderMailTemplate(id, mail.vars, { locale: mail.locale, appUrl: appUrl(env) });
  return sendMail({ to: mail.to, subject: rendered.subject, text: rendered.text, html: rendered.html, template: id }, env);
}
