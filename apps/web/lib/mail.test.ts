import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { mailDelivery, sendMail } from "./mail";
import { fill, MAIL_LOCALES, MAIL_TEMPLATES, type MailTemplateId, placeholdersOf, renderMailTemplate } from "./mail-templates";

const DIR = path.resolve(__dirname, "../mail-templates");
const preview = (id: string) => JSON.parse(fs.readFileSync(path.join(DIR, id, "preview.json"), "utf8"));

describe("mail templates are data", () => {
  it("every template renders in every language, with exactly its declared variables", () => {
    for (const id of Object.keys(MAIL_TEMPLATES) as MailTemplateId[]) {
      const declared = Object.keys(MAIL_TEMPLATES[id]).sort();
      for (const locale of MAIL_LOCALES) {
        const rendered = renderMailTemplate(id, preview(id), { locale, appUrl: "https://api.yazakia.com", dir: DIR });
        expect(rendered.locale).toBe(locale);
        expect(rendered.subject.length).toBeGreaterThan(5);
        expect(rendered.html).toContain(`lang="${locale}"`);
        for (const file of ["subject.txt", "body.html", "body.txt"]) {
          const used = [...placeholdersOf(fs.readFileSync(path.join(DIR, id, locale, file), "utf8"))].sort();
          expect(used.every((name) => declared.includes(name))).toBe(true);
        }
      }
    }
  });

  it("the sign-in code is in the subject and the body, in the person's language", () => {
    const fr = renderMailTemplate("sign-in-code", { code: "482913", minutes: 10 }, { locale: "fr", appUrl: "https://x", dir: DIR });
    expect(fr.subject).toBe("Ton code Yazakia : 482913");
    expect(fr.text).toContain("482913");
    const unknown = renderMailTemplate("sign-in-code", { code: "1", minutes: 10 }, { locale: "de", appUrl: "https://x", dir: DIR });
    expect(unknown.locale).toBe("en");
  });

  it("escapes variables in HTML, refuses unknown or missing ones", () => {
    expect(fill("<p>{name}</p>", { name: "<script>" }, { html: true, allowed: ["name"], name: "t" })).toBe("<p>&lt;script&gt;</p>");
    expect(() => fill("{other}", {}, { html: false, allowed: ["name"], name: "t" })).toThrow(/unknown variable/);
    expect(() => fill("{name}", {}, { html: false, allowed: ["name"], name: "t" })).toThrow(/missing variable/);
  });
});

describe("delivery", () => {
  const mail = { to: "ada@example.test", subject: "s", text: "t", html: "<p>t</p>", template: "sign-in-code" as const };

  it("production always delivers through Mailgun — and without it, refuses (never a code in a log)", async () => {
    expect(mailDelivery({ NODE_ENV: "production", MAIL_DELIVERY: "file" } as unknown as NodeJS.ProcessEnv)).toBe("mailgun");
    await expect(sendMail(mail, { NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).rejects.toThrow(/MAILGUN_API_KEY/);
  });

  it("sends through Mailgun's HTTP API with Basic auth", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const ok = await sendMail(mail, { NODE_ENV: "production", MAILGUN_API_KEY: "key", MAILGUN_DOMAIN: "mg.yazakia.com" } as unknown as NodeJS.ProcessEnv, fetchImpl as unknown as typeof fetch);
    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mailgun.net/v3/mg.yazakia.com/messages");
    expect(new Headers(init.headers).get("Authorization")).toBe(`Basic ${Buffer.from("api:key").toString("base64")}`);
  });

  it("MAIL_DELIVERY=file writes the message to the outbox (end-to-end scenarios)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yazakia-outbox-"));
    await sendMail(mail, { MAIL_DELIVERY: "file", MAIL_OUTBOX_DIR: dir } as unknown as NodeJS.ProcessEnv);
    const [file] = fs.readdirSync(dir);
    expect(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))).toMatchObject({ to: "ada@example.test", template: "sign-in-code" });
  });
});
