import { createI18n, type MessageKey as KeyOf } from "@krizaka/i18n";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * Every user-facing string of the web pages lives in messages/<locale>.json — English (en.json) is the reference, French
 * is a language of design (Yasakia is a Québec app), not a translation. The type arguments make fr.json type-check
 * against en.json: a missing key fails to compile; `krizaka-i18n check` (npm run lint) checks the rest.
 * The engine is @krizaka/i18n, shared with every Krizaka app — this file only binds it.
 */

export type Locale = "en" | "fr";
export type Messages = typeof en;
export type MessageKey = KeyOf<Messages>;

export const LOCALES: readonly Locale[] = ["en", "fr"];

export const i18n = createI18n<Messages, Locale>({ en, fr }, { defaultLocale: "en" });
export const { getDictionary, asLocale } = i18n;
export const translator = (locale: Locale) => i18n.translator(locale);

/** The other language of the pair — the language switch of every page. */
export const otherLocale = (locale: Locale): Locale => LOCALES.find((l) => l !== locale) ?? "en";

export { format } from "@krizaka/i18n";
