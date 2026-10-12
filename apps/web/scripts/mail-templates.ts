/**
 * npm run mail:templates:preview — renders every e-mail template in every language (with its preview.json values) to
 * apps/web/.mail-preview/<id>.<locale>.html / .txt, and fails when one does not render.
 */
import fs from "node:fs";
import path from "node:path";

import { MAIL_LOCALES, MAIL_TEMPLATES, type MailTemplateId, renderMailTemplate } from "../lib/mail-templates";

const dir = path.resolve(__dirname, "..", "mail-templates");
const out = path.resolve(__dirname, "..", ".mail-preview");
fs.mkdirSync(out, { recursive: true });
let problems = 0;
for (const id of Object.keys(MAIL_TEMPLATES) as MailTemplateId[]) {
  const vars = JSON.parse(fs.readFileSync(path.join(dir, id, "preview.json"), "utf8"));
  for (const locale of MAIL_LOCALES) {
    try {
      const mail = renderMailTemplate(id, vars, { locale, appUrl: "https://yazakia.com", dir });
      fs.writeFileSync(path.join(out, `${id}.${locale}.html`), mail.html);
      fs.writeFileSync(path.join(out, `${id}.${locale}.txt`), `Subject: ${mail.subject}\n\n${mail.text}`);
      console.log(`✓ ${id} (${locale}) — ${mail.subject}`);
    } catch (error) {
      problems++;
      console.error(`✗ ${id} (${locale}): ${(error as Error).message}`);
    }
  }
}
console.log(`Previews in ${out}`);
process.exitCode = problems ? 1 : 0;
