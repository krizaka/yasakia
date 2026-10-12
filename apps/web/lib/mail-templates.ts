import fs from "node:fs";
import path from "node:path";

/**
 * E-mail templates are data, not code (the Orochia convention). A template is a folder `apps/web/mail-templates/<id>/`
 * with one sub-folder per locale holding `subject.txt`, `body.html` and `body.txt`, rendered inside the shared layout
 * (`_layout/layout.html` / `layout.txt` + `_layout/<locale>/footer.txt`). The words live in those files, never here.
 *
 * Syntax: `{name}` inserts a variable (HTML-escaped in `.html` files); `{#name}…{/name}` keeps its content when the
 * variable is set and `{^name}…{/name}` when it is not.
 */

type VarKind = "text" | "flag";

/** Every template and its variables — a call that misses or misspells one does not compile. */
export const MAIL_TEMPLATES = {
  "sign-in-code": { code: "text", minutes: "text" },
  "account-deleted": { purgeDays: "text" },
} as const satisfies Record<string, Record<string, VarKind>>;

export type MailTemplateId = keyof typeof MAIL_TEMPLATES;
type VarValue<K> = K extends "flag" ? boolean : string | number;
export type MailVars<Id extends MailTemplateId> = { [K in keyof (typeof MAIL_TEMPLATES)[Id]]: VarValue<(typeof MAIL_TEMPLATES)[Id][K]> };

export const MAIL_LOCALES = ["en", "fr"] as const;
export type MailLocale = (typeof MAIL_LOCALES)[number];
export const DEFAULT_MAIL_LOCALE: MailLocale = "en";

const LAYOUT_VARS = ["content", "subject", "lang", "footer", "appUrl", "year"] as const;

export class MailTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailTemplateError";
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const SECTION = /\{([#^])([A-Za-z]\w*)\}([\s\S]*?)\{\/\2\}/g;
const PLACEHOLDER = /\{([A-Za-z]\w*)\}/g;

/** The variable names a template text refers to (sections included). */
export function placeholdersOf(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/\{[#^/]?([A-Za-z]\w*)\}/g)) names.add(m[1]);
  return names;
}

type Values = Record<string, string | number | boolean>;
const isSet = (v: string | number | boolean | undefined) => v !== undefined && v !== false && v !== "" && v !== 0;

/** Fills one template text; every placeholder must be an allowed variable with a value. */
export function fill(source: string, values: Values, options: { html: boolean; allowed: Iterable<string>; raw?: string[]; name: string }): string {
  const allowed = new Set(options.allowed);
  for (const name of placeholdersOf(source)) {
    if (!allowed.has(name)) throw new MailTemplateError(`${options.name}: unknown variable {${name}}`);
  }
  let out = source;
  for (let guard = 0; guard < 20 && SECTION.test(out); guard++) {
    SECTION.lastIndex = 0;
    out = out.replace(SECTION, (_, mode: string, name: string, body: string) => (isSet(values[name]) === (mode === "#") ? body : ""));
  }
  SECTION.lastIndex = 0;
  return out.replace(PLACEHOLDER, (_, name: string) => {
    const value = values[name];
    if (value === undefined || value === null) throw new MailTemplateError(`${options.name}: missing variable {${name}}`);
    if (typeof value === "boolean") throw new MailTemplateError(`${options.name}: {${name}} is a flag, use it as {#${name}}…{/${name}}`);
    const text = String(value);
    return options.html && !options.raw?.includes(name) ? escapeHtml(text) : text;
  });
}

/** The bundled templates: MAIL_TEMPLATES_DIR, else `mail-templates/` next to the app (dev, standalone image, tests). */
export function templatesDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MAIL_TEMPLATES_DIR) return path.resolve(env.MAIL_TEMPLATES_DIR);
  const cwd = process.cwd();
  const candidates = [path.join(/* turbopackIgnore: true */ cwd, "mail-templates"), path.join(/* turbopackIgnore: true */ cwd, "apps", "web", "mail-templates")];
  return candidates.find((dir) => fs.existsSync(path.join(/* turbopackIgnore: true */ dir, "_layout"))) ?? candidates[0];
}

function readFile(dir: string, relative: string): string | null {
  const file = path.join(/* turbopackIgnore: true */ dir, relative);
  if (!file.startsWith(dir + path.sep)) return null;
  try {
    return fs.readFileSync(/* turbopackIgnore: true */ file, "utf8");
  } catch {
    return null;
  }
}

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
  locale: MailLocale;
}

/** Renders a template in a locale (English when the locale has no files), inside the layout. */
export function renderMailTemplate<Id extends MailTemplateId>(id: Id, vars: MailVars<Id>, options: { locale?: string; appUrl: string; dir?: string; now?: Date }): RenderedMail {
  const dir = options.dir ?? templatesDir();
  const wanted = (MAIL_LOCALES as readonly string[]).includes(options.locale ?? "") ? (options.locale as MailLocale) : DEFAULT_MAIL_LOCALE;
  const values = vars as unknown as Values;
  const allowed = Object.keys(MAIL_TEMPLATES[id]);
  for (const name of allowed) {
    if (values[name] === undefined || values[name] === null) throw new MailTemplateError(`${id}: missing variable {${name}}`);
  }
  for (const locale of wanted === DEFAULT_MAIL_LOCALE ? [wanted] : [wanted, DEFAULT_MAIL_LOCALE]) {
    const files = {
      subject: readFile(dir, `${id}/${locale}/subject.txt`),
      html: readFile(dir, `${id}/${locale}/body.html`),
      text: readFile(dir, `${id}/${locale}/body.txt`),
      layoutHtml: readFile(dir, "_layout/layout.html"),
      layoutText: readFile(dir, "_layout/layout.txt"),
      footer: readFile(dir, `_layout/${locale}/footer.txt`),
    };
    if (Object.values(files).some((v) => v === null)) continue;
    const f = files as Record<keyof typeof files, string>;
    const name = `${id}/${locale}`;
    const subject = fill(f.subject, values, { html: false, allowed, name: `${name}/subject.txt` }).replace(/\s+/g, " ").trim();
    if (!subject) throw new MailTemplateError(`${name}/subject.txt: empty subject`);
    const layout: Values = { subject, lang: locale, appUrl: options.appUrl, year: (options.now ?? new Date()).getUTCFullYear() };
    const footer = fill(f.footer, layout, { html: false, allowed: ["appUrl", "year"], name: `_layout/${locale}/footer.txt` }).trim();
    const htmlBody = fill(f.html, values, { html: true, allowed, name: `${name}/body.html` });
    const textBody = fill(f.text, values, { html: false, allowed, name: `${name}/body.txt` }).trim();
    return {
      subject,
      html: fill(f.layoutHtml, { ...layout, footer, content: htmlBody }, { html: true, allowed: LAYOUT_VARS, raw: ["content"], name: "_layout/layout.html" }),
      text: fill(f.layoutText, { ...layout, footer, content: textBody }, { html: false, allowed: LAYOUT_VARS, name: "_layout/layout.txt" }).trim() + "\n",
      locale,
    };
  }
  throw new MailTemplateError(`${id}: no template (${wanted} or ${DEFAULT_MAIL_LOCALE}) in ${dir}`);
}
